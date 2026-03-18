import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TrackingState {
  isTracking: boolean;
  permissionDenied: boolean;
  lastSentAt: number | null;
}

interface QueuedLocationPayload {
  assignment_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  heading: number | null;
  accuracy_meters: number | null;
}

const INTERVAL_MOVING_MS = 5_000;
const INTERVAL_IDLE_MS = 15_000;
const SPEED_THRESHOLD_KMH = 5;
const MAX_QUEUED_POINTS = 20;

export function useBackgroundLocationTracking(assignmentId: string | null) {
  const [state, setState] = useState<TrackingState>({
    isTracking: false,
    permissionDenied: false,
    lastSentAt: null,
  });

  const watchIdRef = useRef<string | number | null>(null);
  const lastSentRef = useRef<number>(0);
  const lastSpeedRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const queueRef = useRef<QueuedLocationPayload[]>([]);
  const flushingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const postLocation = useCallback(async (payload: QueuedLocationPayload) => {
    await supabase.functions.invoke('update-delivery-location', {
      body: payload,
    });
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;

    try {
      while (queueRef.current.length > 0) {
        const nextPayload = queueRef.current[0];
        await postLocation(nextPayload);
        queueRef.current.shift();
        const now = Date.now();
        lastSentRef.current = now;
        if (mountedRef.current) {
          setState((s) => ({ ...s, lastSentAt: now }));
        }
      }
    } catch (error) {
      console.error('[LocationTracking] Queue flush failed:', error);
    } finally {
      flushingRef.current = false;
    }
  }, [postLocation]);

  const enqueueLocation = useCallback((payload: QueuedLocationPayload) => {
    queueRef.current.push(payload);
    if (queueRef.current.length > MAX_QUEUED_POINTS) {
      queueRef.current = queueRef.current.slice(-MAX_QUEUED_POINTS);
    }
  }, []);

  const sendLocation = useCallback(async (
    lat: number,
    lng: number,
    speed: number | null,
    heading: number | null,
    accuracy: number | null,
  ) => {
    if (!assignmentId) return;

    const speedKmh = speed != null ? speed * 3.6 : 0;
    lastSpeedRef.current = speedKmh;

    const now = Date.now();
    const interval = speedKmh > SPEED_THRESHOLD_KMH ? INTERVAL_MOVING_MS : INTERVAL_IDLE_MS;
    if (now - lastSentRef.current < interval) return;

    const payload: QueuedLocationPayload = {
      assignment_id: assignmentId,
      latitude: lat,
      longitude: lng,
      speed_kmh: speedKmh > 0 ? speedKmh : null,
      heading,
      accuracy_meters: accuracy,
    };

    try {
      await flushQueue();
      await postLocation(payload);
      lastSentRef.current = now;
      if (mountedRef.current) {
        setState((s) => ({ ...s, lastSentAt: now }));
      }
    } catch (err) {
      console.error('[LocationTracking] Send failed, queueing point:', err);
      enqueueLocation(payload);
    }
  }, [assignmentId, enqueueLocation, flushQueue, postLocation]);

  const startTracking = useCallback(async () => {
    if (state.isTracking || !assignmentId) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const perm = await Geolocation.requestPermissions();
        if (perm.location === 'denied') {
          setState((s) => ({ ...s, permissionDenied: true }));
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
          },
        );
        watchIdRef.current = id;
        setState((s) => ({ ...s, isTracking: true, permissionDenied: false }));
      } catch (err) {
        console.error('[LocationTracking] Native watch failed:', err);
        toast.error('Could not start location tracking.');
      }
      return;
    }

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
          setState((s) => ({ ...s, permissionDenied: true }));
          toast.error('Location permission denied.');
        }
      },
      { enableHighAccuracy: true },
    );
    watchIdRef.current = id;
    setState((s) => ({ ...s, isTracking: true, permissionDenied: false }));
  }, [assignmentId, sendLocation, state.isTracking]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current == null) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        await Geolocation.clearWatch({ id: watchIdRef.current as string });
      } catch {
        // noop
      }
    } else {
      navigator.geolocation.clearWatch(watchIdRef.current as number);
    }

    watchIdRef.current = null;
    if (mountedRef.current) {
      setState((s) => ({ ...s, isTracking: false }));
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      flushQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushQueue]);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    isTracking: state.isTracking,
    permissionDenied: state.permissionDenied,
    lastSentAt: state.lastSentAt,
    startTracking,
    stopTracking,
  };
}
