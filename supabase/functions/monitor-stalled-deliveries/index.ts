import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: stalledAssignments, error } = await supabase
      .from('delivery_assignments')
      .select('id, order_id, rider_name, rider_phone, last_location_at, status, stalled_notified, orders:orders!delivery_assignments_order_id_fkey(id, buyer_id, seller_id, status, needs_attention)')
      .in('status', ['picked_up', 'on_the_way', 'at_gate'])
      .not('last_location_at', 'is', null)
      .lt('last_location_at', tenMinutesAgo);

    if (error) throw error;

    let flagged = 0;

    for (const assignment of stalledAssignments || []) {
      const order = Array.isArray((assignment as any).orders) ? (assignment as any).orders[0] : (assignment as any).orders;
      if (!order || order.status === 'cancelled') continue;

      const isHardStall = assignment.last_location_at && new Date(assignment.last_location_at).toISOString() < thirtyMinutesAgo;

      // Gap C: For 10-min stalls — flag needs_attention, don't cancel
      if (!order.needs_attention) {
        await supabase
          .from('orders')
          .update({
            needs_attention: true,
            needs_attention_reason: 'GPS tracking paused for over 10 minutes during active delivery',
          } as any)
          .eq('id', order.id);
      }

      // Notify only once
      if (!assignment.stalled_notified) {
        await supabase
          .from('delivery_assignments')
          .update({ stalled_notified: true, updated_at: new Date().toISOString() })
          .eq('id', assignment.id);

        if (order.buyer_id) {
          await supabase.from('notification_queue').insert({
            user_id: order.buyer_id,
            title: '⚠️ Delivery update paused',
            body: isHardStall
              ? 'Location updates have stopped for a while. You can contact the seller or report an issue.'
              : 'Live tracking is temporarily paused. The delivery is still in progress.',
            type: 'delivery_issue',
            reference_path: `/orders/${order.id}`,
            payload: {
              type: 'delivery_issue',
              entity_type: 'order',
              entity_id: order.id,
              workflow_status: 'needs_attention',
              action: 'View Order',
            },
          });
        }

        const { data: seller } = await supabase
          .from('seller_profiles')
          .select('user_id')
          .eq('id', order.seller_id)
          .maybeSingle();

        if (seller?.user_id) {
          await supabase.from('notification_queue').insert({
            user_id: seller.user_id,
            title: '🚨 Tracking paused',
            body: isHardStall
              ? 'Location updates stopped for 30+ min. Please update delivery status or open the app.'
              : 'Location updates stopped for 10+ min. Please keep the app open while delivering.',
            type: 'delivery_issue',
            reference_path: `/orders/${order.id}`,
            payload: {
              type: 'delivery_issue',
              entity_type: 'order',
              entity_id: order.id,
              workflow_status: 'needs_attention',
              action: 'Open Order',
            },
          });
        }

        flagged += 1;
      }
    }

    return new Response(JSON.stringify({ success: true, flagged }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('monitor-stalled-deliveries failed:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
