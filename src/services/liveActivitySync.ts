/**
 * Shared sync logic for Live Activity orchestration.
 * Extracted so it can be called from mount, resume, and polling fallback.
 */
import { supabase } from '@/integrations/supabase/client';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { buildLiveActivityData } from '@/services/liveActivityMapper';

const TAG = '[LA-Sync]';

const ACTIVE_STATUSES = [
  'accepted', 'preparing', 'ready', 'picked_up',
  'on_the_way', 'confirmed',
] as const;

/** Prevents concurrent syncActiveOrders calls from racing */
let syncing = false;

export async function syncActiveOrders(userId: string): Promise<number> {
  if (syncing) {
    console.log(TAG, 'SKIP — sync already in progress');
    return 0;
  }
  syncing = true;
  try {
    console.log(TAG, 'Syncing active buyer orders for', userId);
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status')
      .eq('buyer_id', userId)
      .in('status', ACTIVE_STATUSES);

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

    return orders.length;
  } catch (e) {
    console.error(TAG, 'syncActiveOrders failed:', e);
    return 0;
  }
}
