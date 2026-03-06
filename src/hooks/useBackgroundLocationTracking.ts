import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TrackingState {
  isTracking: boolean;
  permissionDenied: boolean;
  lastSentAt: number | null;
}

const SEND_INTERVAL_MS = 10_000; // Throttle: send at most every 10s

export function useBackgroundLocationTracking(assignmentId: string | null) {
  const [state, setState] = useState<TrackingState>({
    isTracking: false,
    permissionDenied: false,
    lastSentAt: null,
  });

  const watchIdRef = useRef<string | number | null>(null);
  const lastSentRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const sendLocation = useCallback(async (
    lat: number, lng: number, speed: number | null, heading: number | null, accuracy: number | null
  ) => {
    if (!assignmentId) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_INTERVAL_MS) return;
    lastSentRef.current = now;

    try {
      await supabase.functions.invoke('update-delivery-location', {
        body: {
          assignment_id: assignmentId,
          latitude: lat,
          longitude: lng,
          speed_kmh: speed != null ? speed * 3.6 : null, // m/s → km/h
          heading,
          accuracy_meters: accuracy,
        },
      });
      if (mountedRef.current) {
        setState(s => ({ ...s, lastSentAt: now }));
      }
    } catch (err) {
      console.error('[LocationTracking] Send failed:', err);
    }
  }, [assignmentId]);

  const startTracking = useCallback(async () => {
    if (state.isTracking || !assignmentId) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const perm = await Geolocation.requestPermissions();
        if (perm.location === 'denied') {
          setState(s => ({ ...s, permissionDenied: true }));
          toast.error('Location permission denied. Tracking unavailable.');
          return;
        }
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (position, err) => {
            if (err || !position) return;
            sendLocation(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.speed,
              position.coords.heading,
              position.coords.accuracy,
            );
          }
        );
        watchIdRef.current = id;
        setState(s => ({ ...s, isTracking: true, permissionDenied: false }));
      } catch (err) {
        console.error('[LocationTracking] Native watch failed:', err);
        toast.error('Could not start location tracking.');
      }
    } else {
      // Web fallback
      if (!navigator.geolocation) {
        toast.error('Geolocation not supported in this browser.');
        return;
      }
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          sendLocation(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.speed,
            pos.coords.heading,
            pos.coords.accuracy,
          );
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setState(s => ({ ...s, permissionDenied: true }));
            toast.error('Location permission denied.');
          }
        },
        { enableHighAccuracy: true }
      );
      watchIdRef.current = id;
      setState(s => ({ ...s, isTracking: true, permissionDenied: false }));
    }
  }, [assignmentId, state.isTracking, sendLocation]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current == null) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        await Geolocation.clearWatch({ id: watchIdRef.current as string });
      } catch {}
    } else {
      navigator.geolocation.clearWatch(watchIdRef.current as number);
    }
    watchIdRef.current = null;
    if (mountedRef.current) {
      setState(s => ({ ...s, isTracking: false }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopTracking(); };
  }, [stopTracking]);

  return {
    isTracking: state.isTracking,
    permissionDenied: state.permissionDenied,
    lastSentAt: state.lastSentAt,
    startTracking,
    stopTracking,
  };
}
