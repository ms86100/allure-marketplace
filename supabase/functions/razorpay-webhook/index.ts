import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

async function getRazorpaySecret(supabase: any): Promise<string | null> {
  const { data: setting } = await supabase
    .from('admin_settings')
    .select('value, is_active')
    .eq('key', 'razorpay_key_secret')
    .single();

  if (setting?.value && setting.is_active) {
    return setting.value;
  }

  return Deno.env.get('RAZORPAY_KEY_SECRET') || null;
}

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(body)
    );
    
    const expectedBytes = new Uint8Array(signatureBuffer);
    
    const sigBytes = new Uint8Array(signature.length / 2);
    for (let i = 0; i < signature.length; i += 2) {
      sigBytes[i / 2] = parseInt(signature.substring(i, i + 2), 16);
    }
    
    if (expectedBytes.length !== sigBytes.length) return false;
    
    let diff = 0;
    for (let i = 0; i < expectedBytes.length; i++) {
      diff |= expectedBytes[i] ^ sigBytes[i];
    }
    return diff === 0;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/** Parse order IDs from payment notes — supports multi-vendor (order_ids) and single (order_id) */
function resolveOrderIds(notes: any): string[] {
  if (notes?.order_ids) {
    try {
      const parsed = JSON.parse(notes.order_ids);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through */ }
  }
  if (notes?.order_id) return [notes.order_id];
  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    const razorpaySecret = await getRazorpaySecret(supabase);
    if (!razorpaySecret) {
      console.error('Razorpay secret not configured');
      return new Response(
        JSON.stringify({ error: 'Payment gateway not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!signature) {
      console.error('Missing x-razorpay-signature header');
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isValid = await verifySignature(body, signature, razorpaySecret);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.parse(body);
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    console.log('Webhook event:', event);
    console.log('Payment entity:', JSON.stringify({ id: paymentEntity?.id, notes: paymentEntity?.notes }));

    if (event === 'payment.captured') {
      const razorpayPaymentId = paymentEntity.id;
      const allOrderIds = resolveOrderIds(paymentEntity.notes);

      if (allOrderIds.length === 0) {
        console.error('No order IDs found in payment notes — acknowledging to stop retries');
        return new Response(
          JSON.stringify({ acknowledged: true, skipped: 'no_order_id' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Payment ${razorpayPaymentId} captured for ${allOrderIds.length} order(s):`, allOrderIds);

      for (const orderId of allOrderIds) {
        // STEP 1: Idempotent upsert on payment_records
        // Uses UNIQUE(order_id) for upsert, UNIQUE(razorpay_payment_id) for duplicate detection
        const { error: upsertError } = await supabase
          .from('payment_records')
          .upsert({
            order_id: orderId,
            razorpay_payment_id: razorpayPaymentId,
            payment_status: 'paid',
            payment_method: 'online',
            transaction_reference: razorpayPaymentId,
            payment_collection: 'direct',
            payment_mode: 'online',
          }, { onConflict: 'order_id', ignoreDuplicates: false });

        if (upsertError) {
          // 23505 = unique_violation on razorpay_payment_id → true duplicate webhook
          if (upsertError.code === '23505') {
            console.log(`Duplicate webhook: payment ${razorpayPaymentId} already recorded for order ${orderId}, skipping`);
            continue;
          }
          console.error(`Payment record upsert error for order ${orderId}:`, upsertError);
          // Don't skip — still try to update the order
        }

        // STEP 2: State-guarded order update
        // Only advance orders that are still pending payment — never overwrite cancelled/advanced
        const { error: orderError, data: updatedOrder } = await supabase
          .from('orders')
          .update({
            status: 'placed',
            payment_status: 'paid',
            razorpay_payment_id: razorpayPaymentId,
          })
          .eq('id', orderId)
          .in('status', ['payment_pending', 'placed'])
          .in('payment_status', ['pending'])
          .select('id, seller_id, buyer_id');

        if (orderError) {
          console.error(`Error updating order ${orderId}:`, orderError);
        }

        if (!updatedOrder || updatedOrder.length === 0) {
          console.warn(`Order ${orderId} already advanced or cancelled — skipping notification`);
          continue;
        }

        // STEP 3: Notification ONLY if DB actually changed rows
        const order = updatedOrder[0];
        const { data: sellerProfile } = await supabase
          .from('seller_profiles')
          .select('user_id')
          .eq('id', order.seller_id)
          .single();

        const { data: buyerProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', order.buyer_id)
          .single();

        if (sellerProfile?.user_id) {
          const buyerName = buyerProfile?.name || 'A buyer';
          await supabase
            .from('notification_queue')
            .insert({
              user_id: sellerProfile.user_id,
              type: 'order',
              title: '🆕 New Order Received!',
              body: `${buyerName} placed an order. Tap to view and accept.`,
              reference_path: `/orders/${orderId}`,
              payload: { orderId, status: 'placed', type: 'order' },
            });
        }

        console.log(`✅ Order ${orderId} → paid + placed, seller notified`);
      }
    } else if (event === 'payment.failed') {
      const allOrderIds = resolveOrderIds(paymentEntity.notes);

      for (const orderId of allOrderIds) {
        console.log(`Payment failed for order ${orderId}`);
        
        // Guard: never overwrite a 'paid' status with 'failed'
        await supabase
          .from('orders')
          .update({ payment_status: 'failed' })
          .eq('id', orderId)
          .neq('payment_status', 'paid');

        await supabase
          .from('payment_records')
          .update({ payment_status: 'failed' })
          .eq('order_id', orderId)
          .neq('payment_status', 'paid');
      }
    } else if (event === 'refund.created') {
      const allOrderIds = resolveOrderIds(paymentEntity.notes);

      for (const orderId of allOrderIds) {
        console.log(`Refund created for order ${orderId}`);
        
        // Guard: only refund orders that were actually paid
        await supabase
          .from('orders')
          .update({ payment_status: 'refunded' })
          .eq('id', orderId)
          .eq('payment_status', 'paid');

        await supabase
          .from('payment_records')
          .update({ payment_status: 'refunded' })
          .eq('order_id', orderId)
          .eq('payment_status', 'paid');
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
