import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hapticVibrate, hapticNotification } from '@/lib/haptics';

const ACTIONABLE_STATUSES = ['placed', 'enquired', 'quoted'] as const;

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

interface NewOrder {
  id: string;
  status: string;
  created_at: string;
  total_amount: number;
}

const MIN_POLL_MS = 3000;
const MAX_POLL_MS = 30000;
const BACKOFF_FACTOR = 1.5;
const SNOOZE_MS = 60000;
const LOOKBACK_MS = 5 * 60 * 1000; // 5 minutes

export function useNewOrderAlert(sellerId: string | null) {
  const queryClient = useQueryClient();
  const [pendingAlert, setPendingAlert] = useState<NewOrder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Look back 5 minutes to catch orders placed while the app was closed
  const lastSeenAtRef = useRef<string>(new Date(Date.now() - LOOKBACK_MS).toISOString());
  const pollDelayRef = useRef(MIN_POLL_MS);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const snoozedUntilRef = useRef<Record<string, number>>({});

  const handleNewOrder = useCallback((order: NewOrder) => {
    if (seenIdsRef.current.has(order.id)) return;
    if (dismissedIdsRef.current.has(order.id)) return;
    if (!ACTIONABLE_STATUSES.includes(order.status as typeof ACTIONABLE_STATUSES[number])) return;
    // Check snooze
    const snoozedUntil = snoozedUntilRef.current[order.id];
    if (snoozedUntil && Date.now() < snoozedUntil) return;
    seenIdsRef.current.add(order.id);
    if (order.created_at > lastSeenAtRef.current) {
      lastSeenAtRef.current = order.created_at;
    }
    pollDelayRef.current = MIN_POLL_MS;
    setPendingAlert(order);
    queryClient.invalidateQueries({ queryKey: ['seller-orders', sellerId] });
    queryClient.invalidateQueries({ queryKey: ['seller-dashboard-stats', sellerId] });
  }, [sellerId, queryClient]);

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
    if (pendingAlert) {
      dismissedIdsRef.current.add(pendingAlert.id);
    }
    stopBuzzing();
    setPendingAlert(null);
  }, [stopBuzzing, pendingAlert]);

  const snooze = useCallback(() => {
    if (pendingAlert) {
      // Remove from seen so it can re-trigger after snooze period
      seenIdsRef.current.delete(pendingAlert.id);
      snoozedUntilRef.current[pendingAlert.id] = Date.now() + SNOOZE_MS;
    }
    stopBuzzing();
    setPendingAlert(null);
  }, [stopBuzzing, pendingAlert]);

  // ── Realtime subscription (primary, instant) ──
  useEffect(() => {
    if (!sellerId) return;

    const channel = supabase
      .channel(`seller-new-orders-${sellerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `seller_id=eq.${sellerId}`,
        },
        (payload) => {
          const n = payload.new as any;
          handleNewOrder({
            id: n.id,
            status: n.status,
            created_at: n.created_at,
            total_amount: n.total_amount,
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sellerId, handleNewOrder]);

  // ── Polling fallback ──
  useEffect(() => {
    if (!sellerId) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, status, total_amount, created_at')
          .eq('seller_id', sellerId)
          .gt('created_at', lastSeenAtRef.current)
          .in('status', ACTIONABLE_STATUSES)
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          handleNewOrder(data[0] as NewOrder);
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

    // Immediate poll on mount to catch orders from while app was closed
    pollTimerRef.current = setTimeout(poll, 0);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [sellerId, handleNewOrder]);

  // ── Start/stop buzzing based on pendingAlert ──
  useEffect(() => {
    if (pendingAlert) {
      startBuzzing();
    } else {
      stopBuzzing();
    }
    return () => stopBuzzing();
  }, [pendingAlert, startBuzzing, stopBuzzing]);

  // ── Cleanup on unmount or sellerId change ──
  useEffect(() => {
    return () => {
      stopBuzzing();
    };
  }, [sellerId, stopBuzzing]);

  return { pendingAlert, dismiss, snooze };
}
