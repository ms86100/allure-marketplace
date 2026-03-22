import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NotificationPayload {
  action?: string;
  reference_path?: string;
  order_id?: string;
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

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_notifications')
        .select('id, title, body, type, reference_path, is_read, created_at, payload')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);

      const notifications = (data as unknown as UserNotification[]) || [];

      // Auto-cleanup: mark delivery notifications for terminal orders as read
      const deliveryTypes = new Set(['delivery_delayed', 'delivery_stalled', 'delivery_en_route', 'delivery_proximity', 'delivery_proximity_imminent']);
      const unreadDeliveryNotifs: UserNotification[] = [];
      const orderIds = new Set<string>();
      for (const n of notifications) {
        if (!n.is_read && deliveryTypes.has(n.type)) {
          const oid = (n.payload as any)?.order_id || (n.payload as any)?.entity_id || n.reference_path?.split('/orders/')?.[1];
          if (oid) {
            orderIds.add(oid);
            unreadDeliveryNotifs.push(n);
          }
        }
      }

      if (orderIds.size > 0) {
        const { data: terminalOrders } = await supabase
          .from('orders')
          .select('id')
          .in('id', [...orderIds])
          .in('status', ['delivered', 'completed', 'cancelled', 'no_show']);
        if (terminalOrders && terminalOrders.length > 0) {
          const terminalSet = new Set(terminalOrders.map((o: any) => o.id));
          const staleIds = unreadDeliveryNotifs
            .filter(n => {
              const oid = (n.payload as any)?.order_id || (n.payload as any)?.entity_id || n.reference_path?.split('/orders/')?.[1];
              return oid && terminalSet.has(oid);
            })
            .map(n => n.id);
          if (staleIds.length > 0) {
            await supabase.from('user_notifications').update({ is_read: true }).in('id', staleIds);
            // Mark locally so UI reflects immediately
            for (const n of notifications) {
              if (staleIds.includes(n.id)) n.is_read = true;
            }
          }
        }
      }

      return notifications;
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
        .order('created_at', { ascending: false })
        .limit(10);
      const notifications = (data as unknown as UserNotification[]) || [];
      if (notifications.length === 0) return null;

      const deliveryTypes = new Set(['delivery_delayed', 'delivery_stalled', 'delivery_en_route', 'delivery_proximity', 'delivery_proximity_imminent']);

      // Collect delivery notifications that need order status checks
      const deliveryNotifs: UserNotification[] = [];
      const orderIds = new Set<string>();
      for (const n of notifications) {
        if (deliveryTypes.has(n.type)) {
          const oid = n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
          if (oid) {
            orderIds.add(oid);
            deliveryNotifs.push(n);
          }
        }
      }

      // Batch-fetch order statuses for all delivery notifications at once
      let terminalOrderIds = new Set<string>();
      if (orderIds.size > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, status')
          .in('id', [...orderIds])
          .in('status', ['delivered', 'completed', 'cancelled', 'no_show']);
        if (orders) {
          terminalOrderIds = new Set(orders.map((o: any) => o.id));
        }
      }

      // Batch-mark stale delivery notifications as read
      const staleIds: string[] = [];
      for (const n of deliveryNotifs) {
        const oid = n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
        if (oid && terminalOrderIds.has(oid)) {
          staleIds.push(n.id);
        }
      }
      if (staleIds.length > 0) {
        await supabase
          .from('user_notifications')
          .update({ is_read: true })
          .in('id', staleIds);
      }

      // Return first valid notification (with action or actionable reference_path)
      const staleSet = new Set(staleIds);
      for (const n of notifications) {
        if (staleSet.has(n.id)) continue;
        if (n?.payload?.action) return n;
        // Fallback: treat order-linked notifications as actionable even without explicit action
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
