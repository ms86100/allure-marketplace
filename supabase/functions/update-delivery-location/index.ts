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

/** ETA in minutes with state-based overrides and optional historical blend */
function calculateEta(distanceMeters: number, speedKmh: number | null, accuracyMeters: number | null, historicalAvgMin: number | null = null): { eta: number | null; skipUpdate: boolean } {
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
  let etaMin = Math.max(1, Math.round((distKm / effectiveSpeed) * 60));

  if (historicalAvgMin != null && historicalAvgMin > 0 && speed < 2) {
    etaMin = Math.max(1, Math.round((etaMin + historicalAvgMin) / 2));
  }

  return { eta: etaMin, skipUpdate: false };
}

/** Detect significant heading change (>90° reversal) */
function hasSignificantHeadingChange(prevHeading: number | null, currentHeading: number | null): boolean {
  if (prevHeading == null || currentHeading == null) return false;
  let diff = Math.abs(currentHeading - prevHeading);
  if (diff > 180) diff = 360 - diff;
  return diff > 90;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await authClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { assignment_id, latitude, longitude, speed_kmh, heading, accuracy_meters } = await req.json();

    if (!assignment_id || latitude == null || longitude == null) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get assignment
    const { data: assignment, error: aErr } = await supabase
      .from('delivery_assignments')
      .select('id, status, order_id, society_id, partner_id, rider_id, last_location_at, stalled_notified, eta_minutes, last_location_lat, last_location_lng, rider_name')
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

    // ═══ AUTH CHECK: verify caller is the assigned rider OR the seller ═══
    let isAuthorized = false;

    // Check 1: Is caller the assigned rider from delivery_partner_pool?
    if (assignment.rider_id) {
      const { data: poolRider } = await supabase
        .from('delivery_partner_pool')
        .select('user_id')
        .eq('id', assignment.rider_id)
        .single();
      if (poolRider?.user_id === callerId) {
        isAuthorized = true;
      }
    }

    // Check 2: Is caller the seller for this order? (seller self-delivery)
    if (!isAuthorized) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('seller_id, delivery_handled_by')
        .eq('id', assignment.order_id)
        .single();

      if (orderData) {
        const { data: sellerProfile } = await supabase
          .from('seller_profiles')
          .select('user_id')
          .eq('id', orderData.seller_id)
          .single();

        if (sellerProfile?.user_id === callerId) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Forbidden: not assigned rider or seller' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Get destination coordinates and seller info for ETA blending
    const { data: orderForDest } = await supabase
      .from('orders')
      .select('delivery_lat, delivery_lng, buyer_id, seller_id')
      .eq('id', assignment.order_id)
      .single();

    let destLat = orderForDest?.delivery_lat;
    let destLng = orderForDest?.delivery_lng;
    const buyerId = orderForDest?.buyer_id;
    const sellerId = orderForDest?.seller_id;

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

      let historicalAvgMin: number | null = null;
      if ((speed_kmh == null || speed_kmh < 2) && sellerId) {
        const currentHour = new Date().getUTCHours();
        const { data: stats } = await supabase
          .from('delivery_time_stats')
          .select('avg_delivery_minutes')
          .eq('seller_id', sellerId)
          .eq('society_id', assignment.society_id)
          .eq('time_bucket', currentHour)
          .maybeSingle();
        if (stats?.avg_delivery_minutes) {
          historicalAvgMin = Number(stats.avg_delivery_minutes);
        }
      }

      const etaResult = calculateEta(distanceMeters, speed_kmh, accuracy_meters, historicalAvgMin);
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

    // ═══ PHASE A: First GPS update after picked_up → en_route notification ═══
    if (
      assignment.status === 'picked_up' &&
      !assignment.last_location_at &&
      buyerId
    ) {
      const { count } = await supabase
        .from('notification_queue')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', buyerId)
        .eq('type', 'delivery_en_route')
        .eq('reference_path', `/orders/${assignment.order_id}`);

      if (!count || count === 0) {
        await supabase.from('notification_queue').insert({
          user_id: buyerId,
          title: '🛵 Your order is on the way!',
          body: 'Your delivery partner has picked up your order and is heading to you.',
          type: 'delivery_en_route',
          reference_path: `/orders/${assignment.order_id}`,
          payload: {
            type: 'delivery_en_route',
            entity_type: 'order',
            entity_id: assignment.order_id,
            workflow_status: 'picked_up',
            action: 'View Tracking',
          },
        });
      }
    }

    // ═══ STALE DETECTION ═══
    if (
      assignment.last_location_at &&
      !assignment.stalled_notified &&
      ['picked_up', 'at_gate'].includes(assignment.status)
    ) {
      const lastAt = new Date(assignment.last_location_at).getTime();
      const staleDiffMs = Date.now() - lastAt;
      if (staleDiffMs > 3 * 60 * 1000 && buyerId) {
        await supabase.from('notification_queue').insert({
          user_id: buyerId,
          title: '⏳ Delivery may be delayed',
          body: 'Your delivery partner appears to have paused. We\'re keeping an eye on it.',
          type: 'delivery_stalled',
          reference_path: `/orders/${assignment.order_id}`,
          payload: {
            type: 'delivery_stalled',
            entity_type: 'order',
            entity_id: assignment.order_id,
            workflow_status: assignment.status,
            action: 'View Tracking',
          },
        });

        await supabase
          .from('delivery_assignments')
          .update({ stalled_notified: true })
          .eq('id', assignment_id);
      }
    }

    // ═══ Smart Delay Detection — ETA spike or heading reversal ═══
    if (
      distanceMeters !== null &&
      buyerId &&
      ['picked_up', 'at_gate'].includes(assignment.status)
    ) {
      const prevEta = assignment.eta_minutes;
      const etaSpike = prevEta != null && etaMinutes != null && (etaMinutes - prevEta) > 5;

      let headingReversal = false;
      if (assignment.last_location_lat && assignment.last_location_lng && heading != null) {
        const prevBearing = Math.atan2(
          longitude - assignment.last_location_lng,
          latitude - assignment.last_location_lat
        ) * (180 / Math.PI);
        headingReversal = hasSignificantHeadingChange(prevBearing, heading);
      }

      if (etaSpike || headingReversal) {
        const { count: delayCount } = await supabase
          .from('notification_queue')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', buyerId)
          .eq('type', 'delivery_delayed')
          .eq('reference_path', `/orders/${assignment.order_id}`);

        if (!delayCount || delayCount === 0) {
          const reason = etaSpike ? 'Traffic or route change detected.' : 'Your delivery partner may have taken a different route.';
          await supabase.from('notification_queue').insert({
            user_id: buyerId,
            title: '🔄 Delivery slightly delayed',
            body: `${reason} Updated ETA: ${etaMinutes ?? '—'} min.`,
            type: 'delivery_delayed',
            reference_path: `/orders/${assignment.order_id}`,
            payload: {
              type: 'delivery_delayed',
              entity_type: 'order',
              entity_id: assignment.order_id,
              workflow_status: assignment.status,
              action: 'View Tracking',
              eta: etaMinutes,
              distance: distanceMeters,
            },
          });
        }
      }
    }

    // ═══ Proximity notifications — 500m and 200m ═══
    if (distanceMeters !== null && buyerId && ['picked_up', 'on_the_way'].includes(assignment.status)) {
      let vehicleType: string | null = null;
      if (assignment.rider_id) {
        const { data: riderInfo } = await supabase
          .from('delivery_partner_pool')
          .select('vehicle_type')
          .eq('id', assignment.rider_id)
          .single();
        vehicleType = riderInfo?.vehicle_type ?? null;
      }

      if (distanceMeters < 500) {
        const { count } = await supabase
          .from('notification_queue')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', buyerId)
          .eq('type', 'delivery_proximity')
          .eq('reference_path', `/orders/${assignment.order_id}`);

        if (!count || count === 0) {
          await supabase.from('notification_queue').insert({
            user_id: buyerId,
            title: '📍 Almost there!',
            body: 'Your delivery partner is nearby and arriving soon!',
            type: 'delivery_proximity',
            reference_path: `/orders/${assignment.order_id}`,
            payload: {
              type: 'delivery_proximity',
              entity_type: 'order',
              entity_id: assignment.order_id,
              workflow_status: 'arriving',
              action: 'View Tracking',
              distance: distanceMeters,
              eta: etaMinutes,
              driver_name: assignment.rider_name ?? null,
              vehicle_type: vehicleType,
            },
          });
        }
      }

      if (distanceMeters < 200) {
        const { count: imminentCount } = await supabase
          .from('notification_queue')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', buyerId)
          .eq('type', 'delivery_proximity_imminent')
          .eq('reference_path', `/orders/${assignment.order_id}`);

        if (!imminentCount || imminentCount === 0) {
          await supabase.from('notification_queue').insert({
            user_id: buyerId,
            title: '🏃 Driver arriving now!',
            body: 'Your delivery partner is almost at your doorstep. Please get ready to receive your order.',
            type: 'delivery_proximity_imminent',
            reference_path: `/orders/${assignment.order_id}`,
            payload: {
              type: 'delivery_proximity_imminent',
              entity_type: 'order',
              entity_id: assignment.order_id,
              workflow_status: 'at_doorstep',
              action: 'View Tracking',
              distance: distanceMeters,
              eta: etaMinutes,
              driver_name: assignment.rider_name ?? null,
              vehicle_type: vehicleType,
            },
          });
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
