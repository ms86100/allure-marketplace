import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Haversine distance in meters */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Proximity state based on distance */
function getProximity(distanceMeters: number): 'at_doorstep' | 'arriving' | 'nearby' | 'en_route' {
  if (distanceMeters < 50) return 'at_doorstep';
  if (distanceMeters < 200) return 'arriving';
  if (distanceMeters < 500) return 'nearby';
  return 'en_route';
}

/** ETA in minutes with state-based overrides */
function calculateEta(distanceMeters: number, speedKmh: number | null, accuracyMeters: number | null): { eta: number | null; skipUpdate: boolean } {
  if (accuracyMeters != null && accuracyMeters > 100) {
    return { eta: null, skipUpdate: true };
  }
  const speed = speedKmh ?? 0;
  if (speed < 2 && distanceMeters < 200) {
    return { eta: 1, skipUpdate: false };
  }
  const effectiveSpeed = speed > 2 ? speed : 15;
  const roadFactor = 1.3;
  const distKm = (distanceMeters * roadFactor) / 1000;
  const etaMin = Math.max(1, Math.round((distKm / effectiveSpeed) * 60));
  return { eta: etaMin, skipUpdate: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify JWT using getUser (standard Supabase pattern)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: authError } = await authClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = authUser.id;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { assignment_id, latitude, longitude, speed_kmh, heading, accuracy_meters } = await req.json();

    if (!assignment_id || latitude == null || longitude == null) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get assignment including rider_id for auth check
    const { data: assignment, error: aErr } = await supabase
      .from('delivery_assignments')
      .select('id, status, order_id, society_id, partner_id, rider_id, last_location_at, stalled_notified')
      .eq('id', assignment_id)
      .single();

    if (aErr || !assignment) {
      return new Response(JSON.stringify({ error: 'Assignment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (['delivered', 'failed', 'cancelled'].includes(assignment.status)) {
      return new Response(JSON.stringify({ error: 'Delivery is no longer active' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth check: verify caller is the assigned rider via rider_id → pool → user_id
    if (assignment.rider_id) {
      const { data: poolRider } = await supabase
        .from('delivery_partner_pool')
        .select('user_id')
        .eq('id', assignment.rider_id)
        .single();

      if (!poolRider?.user_id || poolRider.user_id !== callerId) {
        return new Response(JSON.stringify({ error: 'Forbidden: not assigned rider' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    // If no rider_id set (3PL or unassigned), allow — 3PL uses external tracking

    // Insert location record
    const { error: locErr } = await supabase
      .from('delivery_locations')
      .insert({
        assignment_id,
        partner_id: callerId,
        latitude,
        longitude,
        speed_kmh,
        heading,
        accuracy_meters,
      });

    if (locErr) console.error('Error inserting location:', locErr);

    // Get destination: prefer order delivery coords, fall back to society coords
    const { data: orderForDest } = await supabase
      .from('orders')
      .select('delivery_lat, delivery_lng')
      .eq('id', assignment.order_id)
      .single();

    let destLat = orderForDest?.delivery_lat;
    let destLng = orderForDest?.delivery_lng;

    // Fallback to society coordinates if order doesn't have delivery coords
    if (!destLat || !destLng) {
      const { data: society } = await supabase
        .from('societies')
        .select('latitude, longitude')
        .eq('id', assignment.society_id)
        .single();
      destLat = society?.latitude;
      destLng = society?.longitude;
    }

    let distanceMeters: number | null = null;
    let etaMinutes: number | null = null;
    let proximity: string = 'en_route';
    let skipEtaUpdate = false;

    if (destLat && destLng) {
      distanceMeters = Math.round(haversineDistance(latitude, longitude, destLat, destLng));
      proximity = getProximity(distanceMeters);

      const etaResult = calculateEta(distanceMeters, speed_kmh, accuracy_meters);
      skipEtaUpdate = etaResult.skipUpdate;
      if (!skipEtaUpdate) {
        etaMinutes = etaResult.eta;
      }
    }

    // Build update payload
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      last_location_lat: latitude,
      last_location_lng: longitude,
      last_location_at: now,
      distance_meters: distanceMeters,
    };
    if (!skipEtaUpdate && etaMinutes != null) {
      updateData.eta_minutes = etaMinutes;
    }

    await supabase
      .from('delivery_assignments')
      .update(updateData)
      .eq('id', assignment_id);

    // Stale detection — check if previous update was >3 min ago
    if (
      assignment.last_location_at &&
      !assignment.stalled_notified &&
      ['picked_up', 'at_gate'].includes(assignment.status)
    ) {
      const lastAt = new Date(assignment.last_location_at).getTime();
      const staleDiffMs = Date.now() - lastAt;
      if (staleDiffMs > 3 * 60 * 1000) {
        const { data: order } = await supabase
          .from('orders')
          .select('buyer_id')
          .eq('id', assignment.order_id)
          .single();

        if (order?.buyer_id) {
          await supabase.from('notification_queue').insert({
            user_id: order.buyer_id,
            title: '⏳ Delivery may be delayed',
            body: 'Your delivery partner appears to have paused. We\'re keeping an eye on it.',
            type: 'delivery_stalled',
            reference_path: `/orders/${assignment.order_id}`,
            payload: { orderId: assignment.order_id },
          });
          supabase.functions.invoke('process-notification-queue').catch(() => {});
        }

        await supabase
          .from('delivery_assignments')
          .update({ stalled_notified: true })
          .eq('id', assignment_id);
      }
    }

    // Proximity notifications (one-time at < 500m)
    if (distanceMeters !== null && distanceMeters < 500 && assignment.status === 'picked_up') {
      const { data: order } = await supabase
        .from('orders')
        .select('buyer_id')
        .eq('id', assignment.order_id)
        .single();

      if (order?.buyer_id) {
        const { count } = await supabase
          .from('notification_queue')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', order.buyer_id)
          .eq('type', 'delivery_proximity')
          .eq('reference_path', `/orders/${assignment.order_id}`);

        if (!count || count === 0) {
          await supabase.from('notification_queue').insert({
            user_id: order.buyer_id,
            title: '📍 Almost there!',
            body: distanceMeters < 200
              ? 'Your delivery partner is almost at your doorstep!'
              : 'Your delivery partner is nearby and arriving soon!',
            type: 'delivery_proximity',
            reference_path: `/orders/${assignment.order_id}`,
            payload: { orderId: assignment.order_id, distance: distanceMeters },
          });
          supabase.functions.invoke('process-notification-queue').catch(() => {});
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      eta_minutes: etaMinutes,
      distance_meters: distanceMeters,
      proximity,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('update-delivery-location error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});