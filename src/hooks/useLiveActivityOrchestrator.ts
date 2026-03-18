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



/**
 * Global hook that drives Live Activity from order status changes.
 * Mounted once at the app shell level.
 *
 * Hardened with:
 * - Channel subscription status monitoring
 * - INSERT + UPDATE on delivery_assignments
 * - One-shot syncActiveOrders on mount/resume (no polling)
 * - Runtime diagnostics on first mount
 */
export function useLiveActivityOrchestrator(): void {
  const identity = useContext(IdentityContext);
  const userId = identity?.user?.id ?? null;
  const mountedRef = useRef(false);

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

          // Fetch delivery data, seller name, and item count
          let delivery: any = null;
          let sellerName: string | null = null;
          let itemCount: number | null = null;
          try {
            const sellerId = (payload.new as any)?.seller_id;
            const [deliveryRes, sellerRes, itemCountRes] = await Promise.all([
              supabase
                .from('delivery_assignments')
                .select('eta_minutes, distance_meters, rider_name')
                .eq('order_id', orderId)
                .not('status', 'in', '("cancelled","failed")')
                .maybeSingle(),
              sellerId
                ? supabase
                    .from('seller_profiles')
                    .select('business_name')
                    .eq('id', sellerId)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
              supabase
                .from('order_items')
                .select('id', { count: 'exact', head: true })
                .eq('order_id', orderId),
            ]);
            delivery = deliveryRes.data;
            sellerName = (sellerRes.data as any)?.business_name ?? null;
            itemCount = itemCountRes.count ?? null;
          } catch { /* best-effort */ }

          const activityData = buildLiveActivityData(
            { id: orderId, status: newStatus },
            delivery,
            sellerName,
            itemCount,
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
        const [orderRes, itemCountRes] = await Promise.all([
          supabase
            .from('orders')
            .select('id, status, buyer_id, seller_id')
            .eq('id', row.order_id)
            .eq('buyer_id', userId)
            .maybeSingle(),
          supabase
            .from('order_items')
            .select('id', { count: 'exact', head: true })
            .eq('order_id', row.order_id),
        ]);

        const order = orderRes.data;
        if (!order) return;

        let sellerName: string | null = null;
        if (order.seller_id) {
          const { data: seller } = await supabase
            .from('seller_profiles')
            .select('business_name')
            .eq('id', order.seller_id)
            .maybeSingle();
          sellerName = seller?.business_name ?? null;
        }

        console.log(TAG, `Delivery ${payload.eventType} for order ${order.id}: eta=${row.eta_minutes}, distance=${row.distance_meters}`);

        const data = buildLiveActivityData(order, {
          eta_minutes: row?.eta_minutes,
          distance_meters: row?.distance_meters,
          rider_name: row?.rider_name,
          vehicle_type: null,
        }, sellerName, itemCountRes.count ?? null);
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

  // Polling fallback removed — pure realtime. App-resume one-shot sync remains below.

  // ── App resume re-hydration (one-shot sync) ──
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
