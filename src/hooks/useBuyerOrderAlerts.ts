import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { hapticNotification } from '@/lib/haptics';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Real-time listener for buyer order status updates.
 * Shows an instant in-app toast + haptic when order status changes
 * (e.g., seller accepts, starts preparing, marks ready, etc.)
 */

const STATUS_MESSAGES: Record<string, { icon: string; title: string; description: string; haptic: 'success' | 'warning' | 'error' }> = {
  accepted: { icon: '✅', title: 'Order Accepted!', description: 'The seller has accepted your order.', haptic: 'success' },
  preparing: { icon: '👨‍🍳', title: 'Being Prepared', description: 'Your order is being prepared now.', haptic: 'success' },
  ready: { icon: '🎉', title: 'Order Ready!', description: 'Your order is ready for pickup!', haptic: 'success' },
  picked_up: { icon: '📦', title: 'Order Picked Up', description: 'Your order has been picked up for delivery.', haptic: 'success' },
  delivered: { icon: '🚚', title: 'Order Delivered!', description: 'Your order has been delivered.', haptic: 'success' },
  completed: { icon: '⭐', title: 'Order Completed', description: 'Your order is complete. Leave a review!', haptic: 'success' },
  cancelled: { icon: '❌', title: 'Order Cancelled', description: 'Your order has been cancelled.', haptic: 'error' },
  quoted: { icon: '💰', title: 'Quote Received', description: 'The seller sent you a price quote.', haptic: 'success' },
  scheduled: { icon: '📅', title: 'Booking Confirmed', description: 'Your booking has been confirmed.', haptic: 'success' },
};

export function useBuyerOrderAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`buyer-order-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `buyer_id=eq.${user.id}`,
        },
        (payload) => {
          const newStatus = (payload.new as any)?.status;
          const oldStatus = (payload.old as any)?.status;

          // Only fire on actual status changes
          if (!newStatus || newStatus === oldStatus) return;

          const msg = STATUS_MESSAGES[newStatus];
          if (!msg) return;

          // Haptic feedback
          hapticNotification(msg.haptic);

          // In-app toast
          toast(msg.title, {
            description: msg.description,
            icon: msg.icon,
            duration: 6000,
            action: {
              label: 'View',
              onClick: () => {
                window.location.hash = `#/orders/${(payload.new as any).id}`;
              },
            },
          });

          // Refresh buyer's order list
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
