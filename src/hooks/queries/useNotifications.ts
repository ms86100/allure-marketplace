import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isCircuitOpen } from '@/lib/circuitBreaker';

// Seller-only notification types that should not appear in buyer inbox
const SELLER_ONLY_TYPES = [
  'settlement',
  'seller_approved',
  'seller_rejected',
  'seller_suspended',
  'product_approved',
  'product_rejected',
  'license_approved',
  'license_rejected',
] as const;

const SELLER_ONLY_FILTER = `(${SELLER_ONLY_TYPES.join(',')})`;

export interface NotificationPayload {
  action?: string;
  reference_path?: string;
  order_id?: string;
  orderId?: string;
  [key: string]: unknown;
}

export interface UserNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  reference_path: string | null;
  is_read: boolean;
  created_at: string;
  payload: NotificationPayload | null;
}

const PAGE_SIZE = 30;

/**
 * Fire-and-forget stale cleanup — never throws, never blocks reads.
 */
export async function cleanupStaleDeliveryNotifications(notifications: UserNotification[]) {
  try {
    // Extended to cover order_status and order_update types — not just delivery-specific
    const staleEligibleTypes = new Set([
      'delivery_delayed', 'delivery_stalled', 'delivery_en_route', 'delivery_proximity', 'delivery_proximity_imminent',
      'order_status', 'order_update', 'order_placed', 'order_confirmed', 'order_preparing', 'order_ready',
      'order',  // DB trigger uses 'order' as the column type for all order status notifications
    ]);
    const unreadDeliveryNotifs: UserNotification[] = [];
    const orderIds = new Set<string>();
    for (const n of notifications) {
      if (!n.is_read && staleEligibleTypes.has(n.type)) {
        const oid = (n.payload as any)?.orderId || (n.payload as any)?.order_id || (n.payload as any)?.entity_id || n.reference_path?.split('/orders/')?.[1];
        if (oid) {
          orderIds.add(oid);
          unreadDeliveryNotifs.push(n);
        }
      }
    }
    if (orderIds.size === 0) return;

    const { data: terminalOrders } = await supabase
      .from('orders')
      .select('id')
      .in('id', [...orderIds])
      .in('status', ['delivered', 'completed', 'cancelled', 'no_show']);
    if (!terminalOrders || terminalOrders.length === 0) return;

    const terminalSet = new Set(terminalOrders.map((o: any) => o.id));
    const staleIds = unreadDeliveryNotifs
      .filter(n => {
        const oid = (n.payload as any)?.orderId || (n.payload as any)?.order_id || (n.payload as any)?.entity_id || n.reference_path?.split('/orders/')?.[1];
        return oid && terminalSet.has(oid);
      })
      .map(n => n.id);
    if (staleIds.length > 0) {
      await supabase.from('user_notifications').update({ is_read: true }).in('id', staleIds);
    }
  } catch (e) {
    console.warn('[useNotifications] Stale cleanup failed (non-blocking):', e);
  }
}

export function useNotifications(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['notifications', userId],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      let query = supabase
        .from('user_notifications')
        .select('id, title, body, type, reference_path, is_read, created_at, payload')
        .eq('user_id', userId!)
        .not('type', 'in', SELLER_ONLY_FILTER)
        .not('payload->>target_role', 'eq', 'seller')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data } = await query;
      return (data as unknown as UserNotification[]) || [];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1]?.created_at;
    },
    enabled: !!userId,
    staleTime: 0,
    refetchInterval: 30_000,
  });
}


export function useLatestActionNotification(userId: string | undefined) {
  return useQuery({
    queryKey: ['latest-action-notification', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_notifications')
        .select('id, title, body, type, reference_path, is_read, created_at, payload')
        .eq('user_id', userId!)
        .eq('is_read', false)
        .not('payload', 'is', null)
        .not('type', 'in', SELLER_ONLY_FILTER)
        .not('payload->>target_role', 'eq', 'seller')
        .order('created_at', { ascending: false })
        .limit(10);
      const notifications = (data as unknown as UserNotification[]) || [];
      if (notifications.length === 0) return null;

      // Collect order-linked notifications for recency gating (read-only check)
      const orderIds = new Set<string>();
      for (const n of notifications) {
        const oid = n.payload?.orderId || n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
        if (oid) orderIds.add(oid);
      }

      // Batch-fetch terminal + stale orders for filtering (read-only)
      let terminalOrderIds = new Set<string>();
      const staleOrderIds = new Set<string>();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      if (orderIds.size > 0) {
        const [terminalRes, ageRes] = await Promise.all([
          supabase
            .from('orders')
            .select('id')
            .in('id', [...orderIds])
            .in('status', ['delivered', 'completed', 'cancelled', 'no_show']),
          supabase
            .from('orders')
            .select('id')
            .in('id', [...orderIds])
            .lt('created_at', twentyFourHoursAgo),
        ]);
        if (terminalRes.data) {
          terminalOrderIds = new Set(terminalRes.data.map((o: any) => o.id));
        }
        if (ageRes.data) {
          for (const o of ageRes.data) staleOrderIds.add(o.id);
        }
      }

      // Return first valid notification — skip terminal + stale (>24h) orders
      for (const n of notifications) {
        const linkedOid = n.payload?.orderId || n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
        if (linkedOid && (terminalOrderIds.has(linkedOid) || staleOrderIds.has(linkedOid))) continue;
        if (n?.payload?.action) return n;
        if (n.reference_path?.startsWith('/orders/')) {
          return {
            ...n,
            payload: { ...n.payload, action: 'View Order' },
          } as UserNotification;
        }
      }
      return null;
    },
    enabled: !!userId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('user_notifications').update({ is_read: true }).eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('user_notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] });
    },
  });
}
