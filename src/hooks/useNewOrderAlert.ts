import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hapticVibrate, hapticNotification } from '@/lib/haptics';

const ACTIONABLE_STATUSES = ['placed', 'enquired', 'quoted'] as const;
const ACTIONABLE_STATUSES_INSERT = ['placed', 'enquired', 'quoted', 'confirmed'] as const;

function createAlarmSound(audioContext: AudioContext) {
  const now = audioContext.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.value = i % 2 === 0 ? 880 : 660;
    osc.type = 'square';
    const start = now + i * 0.2;
    gain.gain.setValueAtTime(0.25, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18);
    osc.start(start);
    osc.stop(start + 0.2);
  }
}

export interface NewOrder {
  id: string;
  status: string;
  created_at: string;
  total_amount: number;
  seller_id?: string;
}

const MIN_POLL_MS = 3000;
const MAX_POLL_MS = 30000;
const BACKOFF_FACTOR = 1.5;
const SNOOZE_MS = 60000;

export function useNewOrderAlert(sellerIds: string[]) {
  const queryClient = useQueryClient();
  const [pendingAlerts, setPendingAlerts] = useState<NewOrder[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenAtRef = useRef<string | null>(null);
  const pollDelayRef = useRef(MIN_POLL_MS);
  const mountedAtRef = useRef(new Date().toISOString());
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seenIdsOrderRef = useRef<string[]>([]);
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const snoozedUntilRef = useRef<Record<string, number>>({});

  // Stable reference for sellerIds to use in callbacks
  const sellerIdsRef = useRef<Set<string>>(new Set());
  useMemo(() => {
    sellerIdsRef.current = new Set(sellerIds);
  }, [sellerIds]);

  const enabled = sellerIds.length > 0;

  const MAX_SEEN_IDS = 500;
  const handleNewOrder = useCallback((order: NewOrder) => {
    if (seenIdsRef.current.has(order.id)) return;
    if (dismissedIdsRef.current.has(order.id)) return;
    if (!ACTIONABLE_STATUSES.includes(order.status as typeof ACTIONABLE_STATUSES[number])) return;
    const snoozedUntil = snoozedUntilRef.current[order.id];
    if (snoozedUntil && Date.now() < snoozedUntil) return;
    seenIdsRef.current.add(order.id);
    seenIdsOrderRef.current.push(order.id);
    while (seenIdsRef.current.size > MAX_SEEN_IDS) {
      const oldest = seenIdsOrderRef.current.shift();
      if (oldest) seenIdsRef.current.delete(oldest);
    }
    if (!lastSeenAtRef.current || order.created_at > lastSeenAtRef.current) {
      lastSeenAtRef.current = order.created_at;
    }
    pollDelayRef.current = MIN_POLL_MS;
    setPendingAlerts(prev => [...prev, order]);
    // Invalidate queries for the specific seller this order belongs to
    if (order.seller_id) {
      queryClient.invalidateQueries({ queryKey: ['seller-orders', order.seller_id] });
      queryClient.invalidateQueries({ queryKey: ['seller-dashboard-stats', order.seller_id] });
    } else {
      // Fallback: invalidate all seller queries
      for (const sid of sellerIdsRef.current) {
        queryClient.invalidateQueries({ queryKey: ['seller-orders', sid] });
        queryClient.invalidateQueries({ queryKey: ['seller-dashboard-stats', sid] });
      }
    }
  }, [queryClient]);

  const stopBuzzing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    } catch {}
  }, []);

  const startBuzzing = useCallback(() => {
    if (intervalRef.current) return;
    hapticNotification('warning');
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      createAlarmSound(audioCtxRef.current);
    } catch (e) {
      console.warn('[OrderAlert] Sound failed:', e);
    }
    intervalRef.current = setInterval(() => {
      hapticVibrate(500);
      try {
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          createAlarmSound(audioCtxRef.current);
        }
      } catch {}
    }, 3000);
  }, []);

  const dismiss = useCallback(() => {
    setPendingAlerts(prev => {
      if (prev.length === 0) return prev;
      dismissedIdsRef.current.add(prev[0].id);
      const remaining = prev.slice(1);
      if (remaining.length === 0) stopBuzzing();
      return remaining;
    });
  }, [stopBuzzing]);

  const snooze = useCallback(() => {
    setPendingAlerts(prev => {
      if (prev.length === 0) return prev;
      const current = prev[0];
      seenIdsRef.current.delete(current.id);
      snoozedUntilRef.current[current.id] = Date.now() + SNOOZE_MS;
      const remaining = prev.slice(1);
      if (remaining.length === 0) stopBuzzing();
      return remaining;
    });
  }, [stopBuzzing]);

  // ── Realtime subscription (primary, instant) ──
  // Subscribe without seller_id filter; check membership client-side
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('seller-new-orders-multi')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const n = payload.new as any;
          if (!sellerIdsRef.current.has(n.seller_id)) return;
          handleNewOrder({
            id: n.id,
            status: n.status,
            created_at: n.created_at,
            total_amount: n.total_amount,
            seller_id: n.seller_id,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const n = payload.new as any;
          if (!sellerIdsRef.current.has(n.seller_id)) return;
          if (ACTIONABLE_STATUSES.includes(n.status)) {
            handleNewOrder({
              id: n.id,
              status: n.status,
              created_at: n.created_at,
              total_amount: n.total_amount,
              seller_id: n.seller_id,
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [enabled, handleNewOrder]);

  // ── Polling fallback — uses .in() for multiple seller IDs ──
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let pausedByVisibility = false;

    const poll = async () => {
      if (cancelled || pausedByVisibility) return;
      try {
        let query = supabase
          .from('orders')
          .select('id, status, total_amount, created_at, seller_id')
          .in('seller_id', sellerIds)
          .in('status', [...ACTIONABLE_STATUSES])
          .order('created_at', { ascending: true });

        if (lastSeenAtRef.current) {
          query = query.gt('created_at', lastSeenAtRef.current);
        } else {
          query = query.gt('created_at', mountedAtRef.current);
        }

        const { data } = await query;

        if (data && data.length > 0) {
          data.forEach(order => handleNewOrder(order as NewOrder));
          pollDelayRef.current = MIN_POLL_MS;
        } else {
          pollDelayRef.current = Math.min(pollDelayRef.current * BACKOFF_FACTOR, MAX_POLL_MS);
        }
      } catch {
        // Silently ignore poll errors
      }

      if (!cancelled) {
        pollTimerRef.current = setTimeout(poll, pollDelayRef.current);
      }
    };

    pollTimerRef.current = setTimeout(poll, 0);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pausedByVisibility = true;
        if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
      } else {
        pausedByVisibility = false;
        pollDelayRef.current = MIN_POLL_MS;
        if (!pollTimerRef.current) pollTimerRef.current = setTimeout(poll, 0);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, sellerIds.join(','), handleNewOrder]);

  // ── Start/stop buzzing based on pendingAlerts ──
  useEffect(() => {
    if (pendingAlerts.length > 0) {
      startBuzzing();
    } else {
      stopBuzzing();
    }
    return () => stopBuzzing();
  }, [pendingAlerts.length, startBuzzing, stopBuzzing]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopBuzzing();
    };
  }, [stopBuzzing]);

  return { pendingAlerts, dismiss, snooze };
}
