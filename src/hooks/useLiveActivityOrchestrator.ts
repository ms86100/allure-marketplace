import { useEffect, useRef, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IdentityContext } from '@/contexts/auth/contexts';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { buildLiveActivityData } from '@/services/liveActivityMapper';
import { Capacitor } from '@capacitor/core';

const TAG = '[LiveActivityOrchestrator]';

/** Non-terminal statuses where a live activity should be active */
const ACTIVE_STATUSES = [
  'accepted', 'preparing', 'ready', 'picked_up',
  'on_the_way', 'confirmed',
] as const;

const TERMINAL_STATUSES = new Set([
  'delivered', 'completed', 'cancelled', 'no_show', 'failed',
]);

/**
 * Global hook that drives Live Activity from order status changes.
 * Mounted once at the app shell level — NOT tied to any page.
 *
 * Responsibilities:
 * 1. On mount: fetch active buyer orders and push into LiveActivityManager
 * 2. Subscribe to realtime order updates for the buyer
 * 3. Subscribe to delivery_assignments changes for ETA/rider updates
 * 4. On app resume: re-hydrate
 */
export function useLiveActivityOrchestrator(): void {
  const identity = useContext(IdentityContext);
  const userId = identity?.user?.id ?? null;
  const mountedRef = useRef(false);

  // ── Initial sync: fetch active orders and push ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    mountedRef.current = true;

    const syncActiveOrders = async () => {
      try {
        console.log(TAG, 'Syncing active buyer orders');
        const { data: orders, error } = await supabase
          .from('orders')
          .select('id, status')
          .eq('buyer_id', userId)
          .in('status', ACTIVE_STATUSES);

        if (error) {
          console.error(TAG, 'Failed to fetch active orders:', error.message);
          return;
        }

        if (!orders || orders.length === 0) {
          console.log(TAG, 'No active orders to sync');
          return;
        }

        console.log(TAG, `Found ${orders.length} active order(s), pushing to LiveActivityManager`);

        // Fetch delivery data for these orders
        const orderIds = orders.map((o) => o.id);
        const { data: deliveries } = await supabase
          .from('delivery_assignments')
          .select('order_id, eta_minutes, distance_meters, rider_name')
          .in('order_id', orderIds)
          .not('status', 'in', '("cancelled","failed")');

        const deliveryMap = new Map(
          (deliveries ?? []).map((d: any) => [d.order_id, d])
        );

        for (const order of orders) {
          const delivery = deliveryMap.get(order.id) ?? null;
          const data = buildLiveActivityData(order, delivery);
          await LiveActivityManager.push(data);
        }
      } catch (e) {
        console.error(TAG, 'syncActiveOrders failed:', e);
      }
    };

    syncActiveOrders();

    return () => {
      mountedRef.current = false;
    };
  }, [userId]);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ── Realtime: delivery assignment updates (ETA, rider, distance) ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    console.log(TAG, 'Subscribing to delivery assignment updates');

    const channel = supabase
      .channel(`la-delivery-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_assignments',
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row?.order_id) return;

          // Check if this order belongs to us
          try {
            const { data: order } = await supabase
              .from('orders')
              .select('id, status, buyer_id')
              .eq('id', row.order_id)
              .eq('buyer_id', userId)
              .maybeSingle();

            if (!order) return;

            console.log(TAG, `Delivery update for order ${order.id}: eta=${row.eta_minutes}, distance=${row.distance_meters}`);

            const data = buildLiveActivityData(order, {
              eta_minutes: row?.eta_minutes,
              distance_meters: row?.distance_meters,
              rider_name: row?.rider_name,
              vehicle_type: row.vehicle_type,
            });
            await LiveActivityManager.push(data);
          } catch { /* best-effort */ }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ── App resume re-hydration ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive || !mountedRef.current) return;

          console.log(TAG, 'App resumed — re-hydrating Live Activity');
          LiveActivityManager.resetHydration();

          // Re-sync active orders
          const { data: orders } = await supabase
            .from('orders')
            .select('id, status')
            .eq('buyer_id', userId)
            .in('status', ACTIVE_STATUSES);

          if (!orders || orders.length === 0) return;

          const orderIds = orders.map((o) => o.id);
          const { data: deliveries } = await supabase
            .from('delivery_assignments')
            .select('order_id, eta_minutes, distance_meters, rider_name, vehicle_type')
            .in('order_id', orderIds)
            .not('status', 'in', '("cancelled","failed")');

          const deliveryMap = new Map(
            (deliveries ?? []).map((d) => [d.order_id, d])
          );

          for (const order of orders) {
            const delivery = deliveryMap.get(order.id) ?? null;
            const data = buildLiveActivityData(order, delivery);
            await LiveActivityManager.push(data);
          }
        });
        cleanup = () => listener.remove();
      } catch (e) {
        console.error(TAG, 'Failed to register app resume listener:', e);
      }
    })();

    return () => cleanup?.();
  }, [userId]);
}
