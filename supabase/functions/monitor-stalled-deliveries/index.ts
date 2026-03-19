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

    // Fetch all DB-backed config: notification text + thresholds
    const { data: settingsRows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'stalled_buyer_title', 'stalled_buyer_body_soft', 'stalled_buyer_body_hard',
        'stalled_seller_title', 'stalled_seller_body_soft', 'stalled_seller_body_hard',
        'stalled_soft_threshold_minutes', 'stalled_hard_threshold_minutes',
        'transit_statuses',
      ]);
    const settings: Record<string, string> = {};
    for (const row of settingsRows || []) {
      if (row.key && row.value) settings[row.key] = row.value;
    }

    const buyerTitle = settings['stalled_buyer_title'] || '⚠️ Delivery update paused';
    const buyerBodySoft = settings['stalled_buyer_body_soft'] || 'Live tracking is temporarily paused. The delivery is still in progress.';
    const buyerBodyHard = settings['stalled_buyer_body_hard'] || 'Location updates have stopped for a while. You can contact the seller or report an issue.';
    const sellerTitle = settings['stalled_seller_title'] || '🚨 Tracking paused';
    const sellerBodySoft = settings['stalled_seller_body_soft'] || 'Location updates paused. Please keep the app open while delivering.';
    const sellerBodyHard = settings['stalled_seller_body_hard'] || 'Location updates stopped for 3+ min. Please update delivery status or open the app.';

    const softMinutes = parseFloat(settings['stalled_soft_threshold_minutes'] || '1.5');
    const hardMinutes = parseFloat(settings['stalled_hard_threshold_minutes'] || '3');

    let transitStatuses: string[];
    try {
      transitStatuses = JSON.parse(settings['transit_statuses'] || '[]');
      if (transitStatuses.length === 0) {
        console.warn('[monitor-stalled] transit_statuses not configured in system_settings');
      }
    } catch {
      console.warn('[monitor-stalled] Failed to parse transit_statuses from system_settings');
      transitStatuses = [];
    }

    const softThresholdAgo = new Date(Date.now() - softMinutes * 60 * 1000).toISOString();
    const hardThresholdAgo = new Date(Date.now() - hardMinutes * 60 * 1000).toISOString();

    const { data: stalledAssignments, error } = await supabase
      .from('delivery_assignments')
      .select('id, order_id, rider_name, rider_phone, last_location_at, status, stalled_notified, orders:orders!delivery_assignments_order_id_fkey(id, buyer_id, seller_id, status, needs_attention)')
      .in('status', transitStatuses)
      .not('last_location_at', 'is', null)
      .lt('last_location_at', softThresholdAgo);

    if (error) throw error;

    let flagged = 0;

    for (const assignment of stalledAssignments || []) {
      const order = Array.isArray((assignment as any).orders) ? (assignment as any).orders[0] : (assignment as any).orders;
      if (!order || order.status === 'cancelled') continue;

      const isHardStall = assignment.last_location_at && new Date(assignment.last_location_at).toISOString() < hardThresholdAgo;

      // Compute human-readable elapsed time
      const elapsedMs = Date.now() - new Date(assignment.last_location_at!).getTime();
      const elapsedMin = Math.floor(elapsedMs / 60000);
      let elapsedLabel: string;
      if (elapsedMin < 5) {
        elapsedLabel = 'GPS updates paused for a few minutes during active delivery';
      } else if (elapsedMin < 30) {
        elapsedLabel = `GPS updates paused for ${elapsedMin} minutes during active delivery`;
      } else if (elapsedMin < 60) {
        elapsedLabel = 'Tracking has been inactive for over 30 minutes during active delivery';
      } else {
        const hours = Math.floor(elapsedMin / 60);
        elapsedLabel = `Tracking has been inactive for over ${hours} hour${hours > 1 ? 's' : ''} during active delivery`;
      }

      // Always update the reason to reflect current elapsed time
      await supabase
        .from('orders')
        .update({
          needs_attention: true,
          needs_attention_reason: elapsedLabel,
        } as any)
        .eq('id', order.id);

      // Notify only once
      if (!assignment.stalled_notified) {
        await supabase
          .from('delivery_assignments')
          .update({ stalled_notified: true, updated_at: new Date().toISOString() })
          .eq('id', assignment.id);

        if (order.buyer_id) {
          await supabase.from('notification_queue').insert({
            user_id: order.buyer_id,
            title: buyerTitle,
            body: isHardStall ? buyerBodyHard : buyerBodySoft,
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
            title: sellerTitle,
            body: isHardStall ? sellerBodyHard : sellerBodySoft,
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
