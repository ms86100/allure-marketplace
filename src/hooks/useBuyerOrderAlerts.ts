import { useEffect, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IdentityContext } from '@/contexts/auth/contexts';
import { hapticNotification } from '@/lib/haptics';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Real-time listener for buyer order status updates.
 * Drives query invalidation + native haptics only — no toasts.
 */

const HAPTIC_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  accepted: 'success',
  preparing: 'success',
  ready: 'success',
  picked_up: 'success',
  on_the_way: 'success',
  delivered: 'success',
  completed: 'success',
  cancelled: 'error',
  quoted: 'success',
  scheduled: 'success',
  failed: 'error',
};

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
        (payload) => {
          const newStatus = (payload.new as any)?.status;
          const oldStatus = (payload.old as any)?.status;
          // Only react to actual status changes, not internal field updates
          if (!newStatus || newStatus === 'pending' || newStatus === oldStatus) return;

          // Native haptic feedback
          const hapticType = HAPTIC_MAP[newStatus] ?? 'success';
          hapticNotification(hapticType);

          // Keep all queries fresh
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['active-orders-strip'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
