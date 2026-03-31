import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Fetch Razorpay credentials from admin_settings → env fallback */
async function getRazorpayCredentials(supabase: any) {
  const { data: rows } = await supabase
    .from("admin_settings")
    .select("key, value, is_active")
    .in("key", ["razorpay_key_id", "razorpay_key_secret"]);

  const map: Record<string, string> = {};
  for (const r of rows || []) {
    if (r.value && r.is_active) map[r.key] = r.value;
  }

  return {
    keyId: map.razorpay_key_id || Deno.env.get("RAZORPAY_KEY_ID") || "",
    keySecret: map.razorpay_key_secret || Deno.env.get("RAZORPAY_KEY_SECRET") || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { razorpay_payment_id, razorpay_order_id, order_ids } = body;
    const source = body.source || "client_confirm";

    console.log(
      `[confirm-razorpay-payment][${source}] received: order_ids=${JSON.stringify(order_ids)}, razorpay_payment_id=${razorpay_payment_id}, razorpay_order_id=${razorpay_order_id}`
    );

    if (
      (!razorpay_payment_id && !razorpay_order_id) ||
      !order_ids ||
      !Array.isArray(order_ids) ||
      order_ids.length === 0
    ) {
      console.log(`[confirm-razorpay-payment][${source}] result=rejected_bad_input`);
      return new Response(
        JSON.stringify({ error: "Missing razorpay_payment_id/razorpay_order_id or order_ids" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Verify payment with Razorpay API
    const creds = await getRazorpayCredentials(supabase);
    if (!creds.keyId || !creds.keySecret) {
      console.error("Razorpay credentials not configured");
      return new Response(JSON.stringify({ error: "Payment gateway not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = "Basic " + btoa(`${creds.keyId}:${creds.keySecret}`);
    let verifiedPaymentId = razorpay_payment_id;

    // If we have a payment ID, verify it directly
    if (razorpay_payment_id && razorpay_payment_id !== "reconciled") {
      const rzpResponse = await fetch(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        { headers: { Authorization: authHeader } }
      );

      if (!rzpResponse.ok) {
        const errText = await rzpResponse.text();
        console.error("Razorpay API error:", rzpResponse.status, errText);
        return new Response(JSON.stringify({ error: "Payment verification failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payment = await rzpResponse.json();
      console.log("Razorpay payment status:", payment.status, "amount:", payment.amount);

      if (payment.status !== "captured" && payment.status !== "authorized") {
        return new Response(
          JSON.stringify({ error: "Payment not confirmed", status: payment.status }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (razorpay_order_id) {
      // Reconciliation path: look up payments by Razorpay order ID
      const rzpResponse = await fetch(
        `https://api.razorpay.com/v1/orders/${razorpay_order_id}/payments`,
        { headers: { Authorization: authHeader } }
      );

      if (!rzpResponse.ok) {
        const errText = await rzpResponse.text();
        console.error("Razorpay order payments API error:", rzpResponse.status, errText);
        return new Response(JSON.stringify({ error: "Payment verification failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await rzpResponse.json();
      const items = data.items || data;
      const captured = Array.isArray(items)
        ? items.find((p: any) => p.status === "captured" || p.status === "authorized")
        : null;
      if (!captured) {
        return new Response(
          JSON.stringify({ error: "No captured payment found for this order" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      verifiedPaymentId = captured.id;
      console.log("Reconciled payment ID:", verifiedPaymentId);
    } else {
      return new Response(JSON.stringify({ error: "Cannot verify payment without ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Process each order
    const results: { id: string; success: boolean; skipped?: boolean }[] = [];
    const now = new Date().toISOString();

    for (const orderId of order_ids) {
      // Fetch order data for payment_records NOT NULL fields
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("buyer_id, seller_id, total_amount, society_id, status, payment_status")
        .eq("id", orderId)
        .single();

      if (orderErr || !orderData) {
        console.error(`Order ${orderId} not found:`, orderErr);
        results.push({ id: orderId, success: false });
        continue;
      }

      // Skip if already paid
      if (orderData.payment_status === "paid") {
        console.log(`Order ${orderId} already paid — skipping`);
        results.push({ id: orderId, success: true, skipped: true });
        continue;
      }

      // Upsert payment record
      const { error: upsertErr } = await supabase
        .from("payment_records")
        .upsert(
          {
            order_id: orderId,
            buyer_id: orderData.buyer_id,
            seller_id: orderData.seller_id,
            amount: orderData.total_amount,
            net_amount: orderData.total_amount,
            razorpay_payment_id: verifiedPaymentId,
            payment_status: "paid",
            payment_method: "online",
            transaction_reference: verifiedPaymentId,
            payment_collection: "direct",
            payment_mode: "online",
            society_id: orderData.society_id,
          },
          { onConflict: "order_id", ignoreDuplicates: false }
        );

      if (upsertErr && upsertErr.code !== "23505") {
        console.error(`Payment record upsert failed for ${orderId}:`, upsertErr);
      }

      // State-guarded order update: payment_pending/placed → placed + paid
      const { data: updated, error: updateErr } = await supabase
        .from("orders")
        .update({
          status: "placed",
          payment_status: "paid",
          razorpay_payment_id: verifiedPaymentId,
          auto_cancel_at: null,
          updated_at: now,
        })
        .eq("id", orderId)
        .in("status", ["payment_pending", "placed"])
        .in("payment_status", ["pending"])
        .select("id, seller_id, buyer_id");

      if (updateErr) {
        console.error(`Order update failed for ${orderId}:`, updateErr);
        results.push({ id: orderId, success: false });
        continue;
      }

      if (!updated || updated.length === 0) {
        console.log(`Order ${orderId} already advanced — no notification needed`);
        results.push({ id: orderId, success: true, skipped: true });
        continue;
      }

      // Seller notification is handled by the DB trigger fn_enqueue_order_status_notification
      // which fires on the order status change to 'placed'. No manual insert needed here.

      console.log(
        `[confirm-razorpay-payment][${source}] ✅ order=${orderId} result=advanced razorpay_payment_id=${verifiedPaymentId}`
      );
      results.push({ id: orderId, success: true });
    }

    // Trigger notification processing with a 2s delay so the transaction commits
    // and the DB trigger's notification_queue row is visible to the processor
    const successCount = results.filter((r) => r.success && !r.skipped).length;
    if (successCount > 0) {
      setTimeout(() => {
        fetch(`${supabaseUrl}/functions/v1/process-notification-queue`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        }).catch((e) => console.warn("Notification trigger failed:", e));
      }, 2000);
    }

    return new Response(
      JSON.stringify({ success: true, confirmed: successCount, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("confirm-razorpay-payment error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
