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
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);
      return (data as unknown as UserNotification[]) || [];
    },
    enabled: !!userId,
    staleTime: 0,
  });
}

export function useLatestActionNotification(userId: string | undefined) {
  return useQuery({
    queryKey: ['latest-action-notification', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId!)
        .eq('is_read', false)
        .not('payload', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);
      const notifications = (data as unknown as UserNotification[]) || [];
      const deliveryTypes = ['delivery_delayed', 'delivery_stalled', 'delivery_en_route', 'delivery_proximity', 'delivery_proximity_imminent'];
      for (const n of notifications) {
        if (!n?.payload?.action) continue;
        // Skip delivery notifications for orders already delivered/completed
        if (deliveryTypes.includes(n.type)) {
          const orderId = n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
          if (orderId) {
            const { data: order } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle();
            if (order && ['delivered', 'completed', 'cancelled'].includes(order.status)) {
              // Auto-mark as read so it won't appear again
              await supabase.from('user_notifications').update({ is_read: true }).eq('id', n.id);
              continue;
            }
          }
        }
        return n;
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
