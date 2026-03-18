import { useEffect, useRef, useContext, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IdentityContext } from '@/contexts/auth/contexts';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { buildLiveActivityData } from '@/services/liveActivityMapper';
import { syncActiveOrders } from '@/services/liveActivitySync';
import { runLiveActivityDiagnostics } from '@/services/liveActivityDiagnostics';
import { Capacitor } from '@capacitor/core';

const TAG = '[LiveActivityOrchestrator]';

const TERMINAL_STATUSES = new Set([
  'delivered', 'completed', 'cancelled', 'no_show', 'failed',
]);

const POLL_INTERVAL_MS = 15_000; // 15s fallback poll

/**
 * Global hook that drives Live Activity from order status changes.
 * Mounted once at the app shell level.
 *
 * Hardened with:
 * - Channel subscription status monitoring
 * - INSERT + UPDATE on delivery_assignments
 * - Polling fallback for missed realtime events
 * - Shared syncActiveOrders for mount/resume/poll
 * - Runtime diagnostics on first mount
 */
export function useLiveActivityOrchestrator(): void {
  const identity = useContext(IdentityContext);
  const userId = identity?.user?.id ?? null;
  const mountedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSync = useCallback(async () => {
    if (!userId || !mountedRef.current) return;
    await syncActiveOrders(userId);
  }, [userId]);

  // ── Initial sync + diagnostics ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;
    mountedRef.current = true;

    // Run diagnostics once (dry-run, no test start)
    runLiveActivityDiagnostics(true).then((diag) => {
      console.log(TAG, 'Diagnostics:', JSON.stringify(diag));
    });

    // Initial sync
    doSync();

    return () => {
      mountedRef.current = false;
    };
  }, [userId, doSync]);

  // ── Realtime: order status changes ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    console.log(TAG, 'Subscribing to order updates for buyer', userId);

    const channel = supabase
      .channel(`la-order-status-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `buyer_id=eq.${userId}`,
        },
        async (payload) => {
          const newStatus = (payload.new as any)?.status as string | undefined;
          const orderId = (payload.new as any)?.id as string | undefined;
          if (!newStatus || !orderId) return;

          console.log(TAG, `Order ${orderId} status → ${newStatus}`);

          if (TERMINAL_STATUSES.has(newStatus)) {
            await LiveActivityManager.end(orderId);
            return;
          }

          // Fetch delivery data if available
          let delivery: any = null;
          try {
            const { data } = await supabase
              .from('delivery_assignments')
              .select('eta_minutes, distance_meters, rider_name')
              .eq('order_id', orderId)
              .not('status', 'in', '("cancelled","failed")')
              .maybeSingle();
            delivery = data;
          } catch { /* best-effort */ }

          const activityData = buildLiveActivityData(
            { id: orderId, status: newStatus },
            delivery,
          );
          await LiveActivityManager.push(activityData);
        },
      )
      .subscribe((status) => {
        console.log(TAG, `Order channel status: ${status}`);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(TAG, 'Order channel degraded, polling fallback active');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ── Realtime: delivery assignment INSERT + UPDATE ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    console.log(TAG, 'Subscribing to delivery assignment INSERT+UPDATE');

    const handleDeliveryChange = async (payload: any) => {
      const row = payload.new as any;
      if (!row?.order_id) return;

      try {
        const { data: order } = await supabase
          .from('orders')
          .select('id, status, buyer_id')
          .eq('id', row.order_id)
          .eq('buyer_id', userId)
          .maybeSingle();

        if (!order) return;

        console.log(TAG, `Delivery ${payload.eventType} for order ${order.id}: eta=${row.eta_minutes}, distance=${row.distance_meters}`);

        const data = buildLiveActivityData(order, {
          eta_minutes: row?.eta_minutes,
          distance_meters: row?.distance_meters,
          rider_name: row?.rider_name,
          vehicle_type: null,
        });
        await LiveActivityManager.push(data);
      } catch { /* best-effort */ }
    };

    const channel = supabase
      .channel(`la-delivery-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_assignments',
        },
        handleDeliveryChange,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_assignments',
        },
        handleDeliveryChange,
      )
      .subscribe((status) => {
        console.log(TAG, `Delivery channel status: ${status}`);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ── Polling fallback ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    console.log(TAG, 'Starting polling fallback every', POLL_INTERVAL_MS, 'ms');
    pollTimerRef.current = setInterval(doSync, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [userId, doSync]);

  // ── App resume re-hydration ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive || !mountedRef.current) return;
          console.log(TAG, 'App resumed — re-hydrating');
          LiveActivityManager.resetHydration();
          await doSync();
        });
        cleanup = () => listener.remove();
      } catch (e) {
        console.error(TAG, 'Failed to register app resume listener:', e);
      }
    })();

    return () => cleanup?.();
  }, [userId, doSync]);
}
