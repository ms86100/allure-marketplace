import { useEffect, useRef, useContext, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IdentityContext } from '@/contexts/auth/contexts';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { buildLiveActivityData, type StatusFlowEntry } from '@/services/liveActivityMapper';
import { syncActiveOrders } from '@/services/liveActivitySync';
import { runLiveActivityDiagnostics } from '@/services/liveActivityDiagnostics';
import { getTerminalStatuses, invalidateStatusFlowCache } from '@/services/statusFlowCache';
import { Capacitor } from '@capacitor/core';

const TAG = '[LiveActivityOrchestrator]';

/** DB-backed terminal statuses — loaded once at init */
let terminalStatusesCache: Set<string> = new Set([
  'delivered', 'completed', 'cancelled', 'no_show', 'failed',
]);

const MAX_RECONNECT_RETRIES = 3;
const RECONNECT_DELAY_MS = 3000;

/**
 * Global hook that drives Live Activity from order status changes.
 * Mounted once at the app shell level.
 */
export function useLiveActivityOrchestrator(): void {
  const identity = useContext(IdentityContext);
  const userId = identity?.user?.id ?? null;
  const mountedRef = useRef(false);
  /** In-memory set of the buyer's active order IDs for filtering delivery events */
  const activeOrderIdsRef = useRef<Set<string>>(new Set());
  /** Cached status flow entries */
  const flowEntriesRef = useRef<StatusFlowEntry[]>([]);

  const fetchFlowEntries = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('category_status_flows')
        .select('status_key, display_label, sort_order, buyer_hint')
        .eq('transaction_type', 'cart_purchase')
        .eq('parent_group', 'default')
        .order('sort_order');
      if (data) flowEntriesRef.current = data as StatusFlowEntry[];
    } catch { /* best-effort */ }
  }, []);

  const doSync = useCallback(async () => {
    if (!userId || !mountedRef.current) return;
    // Refresh active order IDs for delivery channel filtering
    try {
      const { data } = await supabase
        .from('orders')
        .select('id')
        .eq('buyer_id', userId)
        .not('status', 'in', '("delivered","completed","cancelled","no_show","failed")');
      if (data) {
        activeOrderIdsRef.current = new Set(data.map(o => o.id));
      }
    } catch { /* best-effort */ }
    await syncActiveOrders(userId);
  }, [userId]);

  // ── Initial sync + diagnostics ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;
    mountedRef.current = true;

    runLiveActivityDiagnostics(true).then((diag) => {
      console.log(TAG, 'Diagnostics:', JSON.stringify(diag));
    });

    fetchFlowEntries();
    getTerminalStatuses().then(s => { terminalStatusesCache = s; }).catch(() => {});
    doSync();

    return () => {
      mountedRef.current = false;
    };
  }, [userId, doSync, fetchFlowEntries]);

  // ── Realtime: order status changes (with auto-reconnect) ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let retryCount = 0;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOrderUpdate = async (payload: any) => {
      const newStatus = (payload.new as any)?.status as string | undefined;
      const orderId = (payload.new as any)?.id as string | undefined;
      if (!newStatus || !orderId) return;

      console.log(TAG, `Order ${orderId} status → ${newStatus}`);

      if (terminalStatusesCache.has(newStatus)) {
        activeOrderIdsRef.current.delete(orderId);
        await LiveActivityManager.end(orderId);
        return;
      }

      // Track active order
      activeOrderIdsRef.current.add(orderId);

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
            ? supabase.from('seller_profiles').select('business_name').eq('id', sellerId).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId),
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
        flowEntriesRef.current,
      );
      await LiveActivityManager.push(activityData);
    };

    const subscribe = () => {
      console.log(TAG, `Subscribing to order updates for buyer ${userId} (attempt ${retryCount + 1})`);

      const channel = supabase
        .channel(`la-order-status-${userId}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `buyer_id=eq.${userId}`,
          },
          handleOrderUpdate,
        )
        .subscribe((status) => {
          console.log(TAG, `Order channel status: ${status}`);
          if (status === 'SUBSCRIBED') {
            retryCount = 0;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(TAG, `Order channel degraded (${status}), attempting reconnect...`);
            attemptReconnect();
          }
        });

      channelRef = channel;
    };

    const attemptReconnect = () => {
      if (!mountedRef.current) return;
      if (retryCount >= MAX_RECONNECT_RETRIES) {
        console.error(TAG, `Order channel: max reconnects (${MAX_RECONNECT_RETRIES}) exceeded`);
        return;
      }
      retryCount++;
      if (channelRef) {
        supabase.removeChannel(channelRef);
        channelRef = null;
      }
      retryTimer = setTimeout(() => {
        if (!mountedRef.current) return;
        subscribe();
        doSync();
      }, RECONNECT_DELAY_MS);
    };

    subscribe();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [userId, doSync]);

  // ── Realtime: delivery assignment INSERT + UPDATE (with order ID filtering) ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    let retryCount = 0;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const handleDeliveryChange = async (payload: any) => {
      const row = payload.new as any;
      if (!row?.order_id) return;

      // Gap 5: Filter — only process events for this buyer's active orders
      if (!activeOrderIdsRef.current.has(row.order_id)) return;

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
        }, sellerName, itemCountRes.count ?? null, flowEntriesRef.current);
        await LiveActivityManager.push(data);
      } catch { /* best-effort */ }
    };

    const subscribe = () => {
      console.log(TAG, `Subscribing to delivery assignment INSERT+UPDATE (attempt ${retryCount + 1})`);

      const channel = supabase
        .channel(`la-delivery-${userId}-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_assignments' }, handleDeliveryChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'delivery_assignments' }, handleDeliveryChange)
        .subscribe((status) => {
          console.log(TAG, `Delivery channel status: ${status}`);
          if (status === 'SUBSCRIBED') {
            retryCount = 0;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(TAG, `Delivery channel degraded (${status}), attempting reconnect...`);
            attemptReconnect();
          }
        });

      channelRef = channel;
    };

    const attemptReconnect = () => {
      if (!mountedRef.current) return;
      if (retryCount >= MAX_RECONNECT_RETRIES) {
        console.error(TAG, `Delivery channel: max reconnects (${MAX_RECONNECT_RETRIES}) exceeded`);
        return;
      }
      retryCount++;
      if (channelRef) {
        supabase.removeChannel(channelRef);
        channelRef = null;
      }
      retryTimer = setTimeout(() => {
        if (!mountedRef.current) return;
        subscribe();
        doSync();
      }, RECONNECT_DELAY_MS);
    };

    subscribe();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [userId, doSync]);

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

          invalidateStatusFlowCache();
          LiveActivityManager.resetHydration();
          await fetchFlowEntries();
          getTerminalStatuses().then(s => { terminalStatusesCache = s; }).catch(() => {});
          await doSync();
        });
        cleanup = () => listener.remove();
      } catch (e) {
        console.error(TAG, 'Failed to register app resume listener:', e);
      }
    })();

    return () => cleanup?.();
  }, [userId, doSync, fetchFlowEntries]);
}
