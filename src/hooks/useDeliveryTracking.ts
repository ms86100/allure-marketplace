import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { filterGPSPoint, type FilterState } from '@/lib/gps-filter';

interface RiderLocation {
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  heading: number | null;
  recorded_at: string;
}

interface DeliveryTrackingState {
  riderLocation: RiderLocation | null;
  eta: number | null;
  distance: number | null;
  status: string | null;
  riderName: string | null;
  riderPhone: string | null;
  riderPhotoUrl: string | null;
  lastLocationAt: string | null;
  isLoading: boolean;
  isLocationStale: boolean;
  proximityStatus: string | null;
}

export function useDeliveryTracking(assignmentId: string | null | undefined): DeliveryTrackingState {
  const [state, setState] = useState<DeliveryTrackingState>({
    riderLocation: null,
    eta: null,
    distance: null,
    status: null,
    riderName: null,
    riderPhone: null,
    riderPhotoUrl: null,
    lastLocationAt: null,
    isLoading: true,
    isLocationStale: false,
    proximityStatus: null,
  });

  const gpsFilterState = useRef<FilterState>({
    lastAccepted: null,
    smoothedLat: null,
    smoothedLng: null,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => {
        if (!prev.lastLocationAt) return prev;
        const stale = Date.now() - new Date(prev.lastLocationAt).getTime() > 2 * 60 * 1000;
        return stale !== prev.isLocationStale ? { ...prev, isLocationStale: stale } : prev;
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!assignmentId) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    gpsFilterState.current = { lastAccepted: null, smoothedLat: null, smoothedLng: null };

    (async () => {
      const { data } = await supabase
        .from('delivery_assignments')
        .select('id, status, rider_name, rider_phone, rider_photo_url, eta_minutes, distance_meters, last_location_lat, last_location_lng, last_location_at, proximity_status')
        .eq('id', assignmentId)
        .single();

      if (!data) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      const loc: RiderLocation | null = data.last_location_lat && data.last_location_lng ? {
        latitude: data.last_location_lat,
        longitude: data.last_location_lng,
        speed_kmh: null,
        heading: null,
        recorded_at: data.last_location_at || new Date().toISOString(),
      } : null;

      if (loc) {
        const result = filterGPSPoint(loc, gpsFilterState.current);
        gpsFilterState.current = result.newState;
      }

      setState((prev) => ({
        ...prev,
        status: data.status,
        riderName: data.rider_name,
        riderPhone: data.rider_phone,
        riderPhotoUrl: data.rider_photo_url,
        eta: data.eta_minutes,
        distance: data.distance_meters,
        lastLocationAt: data.last_location_at,
        proximityStatus: data.proximity_status,
        riderLocation: loc,
        isLoading: false,
      }));
    })();

    const assignmentChannel = supabase
      .channel(`tracking-assignment-${assignmentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'delivery_assignments',
        filter: `id=eq.${assignmentId}`,
      }, (payload) => {
        const d = payload.new as any;
        setState((prev) => {
          const incomingRecordedAt = d.last_location_at || null;
          const currentRecordedAt = prev.riderLocation?.recorded_at || prev.lastLocationAt || null;
          const shouldReplaceLocation = Boolean(
            d.last_location_lat &&
            d.last_location_lng &&
            (!currentRecordedAt || (incomingRecordedAt && new Date(incomingRecordedAt).getTime() > new Date(currentRecordedAt).getTime()))
          );

          // Gap E: Apply GPS filter to assignment location too (same as location channel)
          let filteredLocation = prev.riderLocation;
          if (shouldReplaceLocation) {
            const rawPoint: RiderLocation = {
              latitude: d.last_location_lat,
              longitude: d.last_location_lng,
              speed_kmh: prev.riderLocation?.speed_kmh ?? null,
              heading: prev.riderLocation?.heading ?? null,
              recorded_at: d.last_location_at || new Date().toISOString(),
            };
            const result = filterGPSPoint(rawPoint, gpsFilterState.current);
            gpsFilterState.current = result.newState;
            filteredLocation = {
              ...rawPoint,
              latitude: result.filtered.latitude,
              longitude: result.filtered.longitude,
            };
          }

          return {
            ...prev,
            status: d.status ?? prev.status,
            riderName: d.rider_name ?? prev.riderName,
            riderPhone: d.rider_phone ?? prev.riderPhone,
            riderPhotoUrl: d.rider_photo_url ?? prev.riderPhotoUrl,
            eta: d.eta_minutes ?? prev.eta,
            distance: d.distance_meters ?? prev.distance,
            lastLocationAt: d.last_location_at ?? prev.lastLocationAt,
            proximityStatus: d.proximity_status ?? prev.proximityStatus,
            riderLocation: filteredLocation,
          };
        });
      })
      .subscribe();

    const locationChannel = supabase
      .channel(`tracking-location-${assignmentId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'delivery_locations',
        filter: `assignment_id=eq.${assignmentId}`,
      }, (payload) => {
        const loc = payload.new as any;
        const rawPoint: RiderLocation = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          speed_kmh: loc.speed_kmh,
          heading: loc.heading,
          recorded_at: loc.recorded_at,
        };

        const result = filterGPSPoint(rawPoint, gpsFilterState.current);
        gpsFilterState.current = result.newState;

        setState((prev) => ({
          ...prev,
          riderLocation: {
            ...rawPoint,
            latitude: result.filtered.latitude,
            longitude: result.filtered.longitude,
          },
          lastLocationAt: loc.recorded_at,
          isLocationStale: false,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(assignmentChannel);
      supabase.removeChannel(locationChannel);
    };
  }, [assignmentId]);

  return state;
}
