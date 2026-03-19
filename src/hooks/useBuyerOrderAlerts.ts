import { useEffect, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IdentityContext } from '@/contexts/auth/contexts';
import { toast } from 'sonner';
import { hapticNotification } from '@/lib/haptics';
import { useQueryClient } from '@tanstack/react-query';
import { getTransitStatuses } from '@/lib/visibilityEngine';

/**
 * Real-time listener for buyer order status updates.
 * Uses raw useContext with null-safety to avoid fatal crashes
 * if AuthProvider hasn't mounted yet (HMR / startup race).
 */

const STATUS_MESSAGES: Record<string, { icon: string; title: string; description: string; haptic: 'success' | 'warning' | 'error' }> = {
  accepted: { icon: '✅', title: 'Order Accepted!', description: 'The seller has accepted your order.', haptic: 'success' },
  preparing: { icon: '👨‍🍳', title: 'Being Prepared', description: 'Your order is being prepared now.', haptic: 'success' },
  ready: { icon: '🎉', title: 'Order Ready!', description: 'Your order is ready for pickup!', haptic: 'success' },
  picked_up: { icon: '📦', title: 'Order Picked Up', description: 'Your order has been picked up for delivery.', haptic: 'success' },
  on_the_way: { icon: '🛵', title: 'On The Way!', description: 'Your order is on the way to you.', haptic: 'success' },
  delivered: { icon: '🚚', title: 'Order Delivered!', description: 'Your order has been delivered.', haptic: 'success' },
  completed: { icon: '⭐', title: 'Order Completed', description: 'Your order is complete. Leave a review!', haptic: 'success' },
  cancelled: { icon: '❌', title: 'Order Cancelled', description: 'Your order has been cancelled.', haptic: 'error' },
  quoted: { icon: '💰', title: 'Quote Received', description: 'The seller sent you a price quote.', haptic: 'success' },
  scheduled: { icon: '📅', title: 'Booking Confirmed', description: 'Your booking has been confirmed.', haptic: 'success' },
  failed: { icon: '❌', title: 'Delivery Failed', description: 'Your delivery could not be completed.', haptic: 'error' },
};

/** In-memory cache for DB display labels (fetched once per session). */
let displayLabelCache: Record<string, string> | null = null;
async function getDisplayLabel(statusKey: string): Promise<string | null> {
  if (!displayLabelCache) {
    const { data } = await supabase
      .from('category_status_flows')
      .select('status_key, display_label')
      .not('display_label', 'is', null);
    if (data) {
      displayLabelCache = {};
      for (const r of data) {
        if (r.display_label) displayLabelCache[r.status_key] = r.display_label;
      }
    }
  }
  return displayLabelCache?.[statusKey] ?? null;
}

export function useBuyerOrderAlerts() {
  const identity = useContext(IdentityContext);
  const user = identity?.user ?? null;
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
        async (payload) => {
          const newStatus = (payload.new as any)?.status;
          const oldStatus = (payload.old as any)?.status;
          const orderId = (payload.new as any)?.id;

          // Only skip if no new status (toast ID dedup handles duplicates)
          if (!newStatus) return;

          // Skip 'pending' status — user just created the order, they already know
          if (newStatus === 'pending') return;

          // Suppress during active checkout on cart page
          if (window.location.hash.includes('/cart')) return;

          let msg = STATUS_MESSAGES[newStatus];

          // DB-driven fallback: use display_label for admin-added statuses
          if (!msg) {
            const label = await getDisplayLabel(newStatus);
            if (!label) return;
            msg = { icon: '🔔', title: label, description: `Your order status changed to ${label}.`, haptic: 'success' };
          }

          hapticNotification(msg.haptic);

          // Use unique ID per order+status to deduplicate with push notifications
          const toastId = `order-${orderId}-${newStatus}`;

          const isTransit = getTransitStatuses().has(newStatus);

          toast(msg.title, {
            id: toastId,
            description: msg.description,
            icon: msg.icon,
            duration: isTransit ? 3000 : 6000,
            // Suppress "View" action for transit statuses to prevent overlap with bottom nav
            ...(isTransit ? {} : {
              action: {
                label: 'View',
                onClick: () => {
                  window.location.hash = `#/orders/${orderId}`;
                },
              },
            }),
          });

          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
