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

/** DB-backed terminal statuses — loaded once at init. No hardcoded fallbacks. */
let terminalStatusesCache: Set<string> = new Set();

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
        .in('transaction_type', ['cart_purchase', 'seller_delivery'])
        .order('sort_order');
      if (data) flowEntriesRef.current = data as StatusFlowEntry[];
    } catch { /* best-effort */ }
  }, []);

  const doSync = useCallback(async () => {
    if (!userId || !mountedRef.current) return;
    // Use DB-backed terminal statuses for filtering active orders
    const terminalArr = [...terminalStatusesCache];
    try {
      const { data } = await supabase
        .from('orders')
        .select('id')
        .eq('buyer_id', userId)
        .not('status', 'in', `(${terminalArr.map(s => `"${s}"`).join(',')})`);
      if (data) {
        activeOrderIdsRef.current = new Set(data.map(o => o.id));
      }
    } catch { /* best-effort */ }
    await syncActiveOrders(userId);
  }, [userId]);

  // ── Initial sync + diagnostics ──
  useEffect(() => {
    if (!userId) return;
    const isNative = Capacitor.isNativePlatform();
    mountedRef.current = true;

    if (isNative) {
      runLiveActivityDiagnostics(true).then((diag) => {
        console.log(TAG, 'Diagnostics:', JSON.stringify(diag));
      });
    }

    // Ensure flow entries & terminal statuses are loaded BEFORE first sync
    Promise.all([
      fetchFlowEntries(),
      getTerminalStatuses().then(s => { terminalStatusesCache = s; }).catch(() => {}),
    ]).then(() => {
      if (mountedRef.current) doSync();
    });

    return () => {
      mountedRef.current = false;
    };
  }, [userId, doSync, fetchFlowEntries]);

  // ── Realtime: order status changes (with auto-reconnect) ──
  useEffect(() => {
    if (!userId) return;
    const isNative = Capacitor.isNativePlatform();

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
        if (isNative) await LiveActivityManager.end(orderId);
        return;
      }

      // Track active order
      activeOrderIdsRef.current.add(orderId);

      let delivery: any = null;
      let sellerName: string | null = null;
      let sellerLogoUrl: string | null = null;
      let itemCount: number | null = null;
      try {
        const sellerId = (payload.new as any)?.seller_id;
        const [deliveryRes, sellerRes, itemCountRes] = await Promise.all([
          supabase
            .from('delivery_assignments')
            .select('eta_minutes, distance_meters, rider_name')
            .eq('order_id', orderId)
            .not('status', 'in', `(${[...terminalStatusesCache].map(s => `"${s}"`).join(',')})`)
            .maybeSingle(),
          sellerId
            ? supabase.from('seller_profiles').select('business_name, profile_image_url').eq('id', sellerId).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId),
        ]);
        delivery = deliveryRes.data;
        sellerName = (sellerRes.data as any)?.business_name ?? null;
        sellerLogoUrl = (sellerRes.data as any)?.profile_image_url ?? null;
        itemCount = itemCountRes.count ?? null;
      } catch { /* best-effort */ }

      // Fallback: if flowEntries are empty (race condition), fetch inline before building
      let flowEntries = flowEntriesRef.current;
      if (!flowEntries || flowEntries.length === 0) {
        console.warn(TAG, 'flowEntries empty on realtime event — fetching inline');
        await fetchFlowEntries();
        flowEntries = flowEntriesRef.current;
      }

      const activityData = buildLiveActivityData(
        { id: orderId, status: newStatus },
        delivery,
        sellerName,
        itemCount,
        flowEntries,
        sellerLogoUrl,
        delivery?.eta_minutes ?? null,
      );
      if (isNative) await LiveActivityManager.push(activityData);
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
    if (!userId) return;
    const isNative = Capacitor.isNativePlatform();

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
        let sellerLogoUrl: string | null = null;
        if (order.seller_id) {
          const { data: seller } = await supabase
            .from('seller_profiles')
            .select('business_name, profile_image_url')
            .eq('id', order.seller_id)
            .maybeSingle();
          sellerName = seller?.business_name ?? null;
          sellerLogoUrl = seller?.profile_image_url ?? null;
        }

        console.log(TAG, `Delivery ${payload.eventType} for order ${order.id}: eta=${row.eta_minutes}, distance=${row.distance_meters}`);

        const data = buildLiveActivityData(order, {
          eta_minutes: row?.eta_minutes,
          distance_meters: row?.distance_meters,
          rider_name: row?.rider_name,
          vehicle_type: null,
        }, sellerName, itemCountRes.count ?? null, flowEntriesRef.current, sellerLogoUrl, row?.eta_minutes ?? null);
        if (isNative) await LiveActivityManager.push(data);
      } catch { /* best-effort */ }
    };

    const subscribe = () => {
      const activeIds = [...activeOrderIdsRef.current];
      // Use eq filter when single active order to reduce server fan-out; otherwise client-side filter
      const filter = activeIds.length === 1
        ? `order_id=eq.${activeIds[0]}`
        : undefined;

      console.log(TAG, `Subscribing to delivery assignment INSERT+UPDATE (attempt ${retryCount + 1}, filter=${filter ?? 'none, client-side'})`);

      const insertOpts: any = { event: 'INSERT', schema: 'public', table: 'delivery_assignments' };
      const updateOpts: any = { event: 'UPDATE', schema: 'public', table: 'delivery_assignments' };
      if (filter) {
        insertOpts.filter = filter;
        updateOpts.filter = filter;
      }

      const channel = supabase
        .channel(`la-delivery-${userId}-${Date.now()}`)
        .on('postgres_changes', insertOpts, handleDeliveryChange)
        .on('postgres_changes', updateOpts, handleDeliveryChange)
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

  // ── Polling heartbeat: safety net for dead realtime connections (web + native) ──
  useEffect(() => {
    if (!userId) return;
    const isNative = Capacitor.isNativePlatform();

    const POLL_INTERVAL_MS = 15_000; // 15 seconds — tighter safety net
    /** Last-known statuses to avoid redundant processing */
    const lastKnownRef = new Map<string, string>();

    const poll = async () => {
      if (!mountedRef.current) return;
      const terminalArr = [...terminalStatusesCache];
      try {
        // Check ALL orders for this buyer (including potentially terminal ones)
        // to detect orders that became terminal while realtime was down
        const { data } = await supabase
          .from('orders')
          .select('id, status')
          .eq('buyer_id', userId)
          .not('status', 'in', `(${terminalArr.map(s => `"${s}"`).join(',')})`);

        if (!data || data.length === 0) {
          // All orders are terminal — end any lingering Live Activities
          for (const [orderId] of lastKnownRef) {
            console.log(TAG, `Polling: order ${orderId} no longer active, ending LA`);
            if (isNative) await LiveActivityManager.end(orderId);
          }
          lastKnownRef.clear();
          return;
        }

        // Detect orders that disappeared from active set (became terminal)
        const activeIds = new Set(data.map(o => o.id));
        for (const [orderId] of lastKnownRef) {
          if (!activeIds.has(orderId)) {
            console.log(TAG, `Polling: order ${orderId} became terminal, ending LA`);
            await LiveActivityManager.end(orderId);
            lastKnownRef.delete(orderId);
          }
        }

        let hasMismatch = false;
        for (const order of data) {
          if (lastKnownRef.get(order.id) !== order.status) {
            hasMismatch = true;
            lastKnownRef.set(order.id, order.status);
          }
        }

        if (hasMismatch) {
          console.log(TAG, 'Polling heartbeat detected status change — re-syncing');
          await syncActiveOrders(userId);
        }
      } catch { /* best-effort */ }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [userId]);

  // ── Visibility change: immediate sync when user returns to tab/webview ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        console.log(TAG, 'Visibility regained — immediate sync');
        doSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [userId, doSync]);

  // ── Push-driven terminal sync: closes the Realtime-failure gap ──
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    const handler = async (e: Event) => {
      const { orderId, status } = (e as CustomEvent).detail;
      console.log(TAG, 'Push-driven terminal sync:', orderId, status);
      activeOrderIdsRef.current.delete(orderId);
      await LiveActivityManager.end(orderId);
      // Small delay to let DB settle, then sync
      setTimeout(() => doSync(), 300);
    };

    window.addEventListener('order-terminal-push', handler);
    return () => window.removeEventListener('order-terminal-push', handler);
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
