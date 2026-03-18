/**
 * Shared sync logic for Live Activity orchestration.
 * Extracted so it can be called from mount, resume, and polling fallback.
 */
import { supabase } from '@/integrations/supabase/client';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { buildLiveActivityData, type StatusFlowEntry } from '@/services/liveActivityMapper';
import { getStartStatuses } from '@/services/statusFlowCache';

const TAG = '[LA-Sync]';

/** Prevents concurrent syncActiveOrders calls from racing */
let syncing = false;

/** Cached status flow entries to avoid re-fetching on every sync */
let cachedFlowEntries: StatusFlowEntry[] | null = null;
let cacheExpiry = 0;

async function getStatusFlowEntries(): Promise<StatusFlowEntry[]> {
  if (cachedFlowEntries && Date.now() < cacheExpiry) {
    return cachedFlowEntries;
  }
  const { data, error } = await supabase
    .from('category_status_flows')
    .select('status_key, display_label, sort_order, buyer_hint')
    .in('transaction_type', ['cart_purchase', 'seller_delivery'])
    .order('sort_order');

  if (error || !data) {
    console.warn(TAG, 'Failed to fetch status flows, using empty:', error?.message);
    return cachedFlowEntries ?? [];
  }

  cachedFlowEntries = data as StatusFlowEntry[];
  cacheExpiry = Date.now() + 10 * 60 * 1000;
  return cachedFlowEntries;
}

export async function syncActiveOrders(userId: string): Promise<number> {
  if (syncing) {
    console.log(TAG, 'SKIP — sync already in progress');
    return 0;
  }
  syncing = true;
  try {
    console.log(TAG, 'Syncing active buyer orders for', userId);

    // DB-backed active statuses from category_status_flows
    const activeStatuses = [...await getStartStatuses()];
    if (activeStatuses.length === 0) {
      console.warn(TAG, 'No active statuses from DB, skipping sync');
      return 0;
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, seller_id')
      .eq('buyer_id', userId)
      .in('status', activeStatuses);

    if (error) {
      console.error(TAG, 'Failed to fetch active orders:', error.message);
      return 0;
    }

    if (!orders || orders.length === 0) {
      console.log(TAG, 'No active orders');
      return 0;
    }

    console.log(TAG, `Found ${orders.length} active order(s)`);

    const orderIds = orders.map((o) => o.id);
    const sellerIds = [...new Set(orders.map((o) => o.seller_id).filter(Boolean))];

    // Fetch deliveries, seller names, item counts, and status flows in parallel
    const [deliveriesResult, sellersResult, itemCountsResult, flowEntries] = await Promise.all([
      supabase
        .from('delivery_assignments')
        .select('order_id, eta_minutes, distance_meters, rider_name')
        .in('order_id', orderIds)
        .not('status', 'in', '("cancelled","failed")'),
      sellerIds.length > 0
        ? supabase
            .from('seller_profiles')
            .select('id, business_name')
            .in('id', sellerIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('order_items')
        .select('order_id')
        .in('order_id', orderIds),
      getStatusFlowEntries(),
    ]);

    const deliveryMap = new Map(
      (deliveriesResult.data ?? []).map((d: any) => [d.order_id, d])
    );
    const sellerMap = new Map(
      (sellersResult.data ?? []).map((s: any) => [s.id, s.business_name])
    );
    // Count items per order
    const itemCountMap = new Map<string, number>();
    for (const item of (itemCountsResult.data ?? [])) {
      itemCountMap.set(item.order_id, (itemCountMap.get(item.order_id) ?? 0) + 1);
    }

    // Serialize push() calls to prevent hydration race conditions
    for (const order of orders) {
      const delivery = deliveryMap.get(order.id) ?? null;
      const sellerName = sellerMap.get(order.seller_id) ?? null;
      const itemCount = itemCountMap.get(order.id) ?? null;
      const data = buildLiveActivityData(order, delivery, sellerName, itemCount, flowEntries);
      try {
        await LiveActivityManager.push(data);
      } catch (e) {
        console.error(TAG, `push() failed for order ${order.id}:`, e);
      }
    }

    return orders.length;
  } catch (e) {
    console.error(TAG, 'syncActiveOrders failed:', e);
    return 0;
  } finally {
    syncing = false;
  }
}
