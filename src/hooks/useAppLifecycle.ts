// @ts-nocheck
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { cleanupStaleDeliveryNotifications, type UserNotification } from '@/hooks/queries/useNotifications';

/**
 * Listens for Capacitor appStateChange events and invalidates critical
 * queries when the app returns to the foreground. This ensures fresh data
 * on mobile resume without relying on refetchOnWindowFocus (which fires
 * too frequently on Capacitor).
 */
export function useAppLifecycle() {
  const queryClient = useQueryClient();
  const autoCancelFiredRef = useRef(false);
  const staleCleanupFiredRef = useRef(false);

  // Trigger auto-cancel on cold start to sweep stale payment_pending orders
  useEffect(() => {
    if (autoCancelFiredRef.current) return;
    autoCancelFiredRef.current = true;
    supabase.functions.invoke('auto-cancel-orders').catch((e) => {
      console.warn('[AppLifecycle] auto-cancel-orders cold-start sweep failed:', e);
    });

    // One-time stale notification cleanup on cold start
    if (!staleCleanupFiredRef.current) {
      staleCleanupFiredRef.current = true;
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase
          .from('user_notifications')
          .select('id, title, body, type, action_url, is_read, created_at, data')
          .eq('user_id', user.id)
          .eq('is_read', false)
          .limit(100)
          .then(({ data }) => {
            if (data && data.length > 0) {
              cleanupStaleDeliveryNotifications(data as UserNotification[]).then(() => {
                queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
                queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] });
              });
            }
          });
      });
    }
  }, []);

  // Push-driven sync: invalidate all critical queries on terminal order push
  useEffect(() => {
    const onTerminalPush = () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['active-orders-strip'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] });
      queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
      queryClient.invalidateQueries({ queryKey: ['seller-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['cart-items'] });
      queryClient.invalidateQueries({ queryKey: ['cart-count'] });
      window.dispatchEvent(new Event('order-detail-refetch'));
    };
    window.addEventListener('order-terminal-push', onTerminalPush);
    return () => window.removeEventListener('order-terminal-push', onTerminalPush);
  }, [queryClient]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            // Perf: batch-invalidate lightweight queries in a single pass
            const resumeKeys = new Set([
              'featured-banners', 'system-settings-raw', 'system-settings-all',
              'cart-count', 'cart-items', 'unread-notifications', 'notifications',
              'latest-action-notification', 'seller-orders', 'seller-dashboard-stats', 'orders',
            ]);
            queryClient.invalidateQueries({
              predicate: (query) => {
                const key = query.queryKey[0];
                return typeof key === 'string' && resumeKeys.has(key);
              },
            });

            // Dispatch custom event so useOrderDetail re-fetches on resume
            window.dispatchEvent(new Event('order-detail-refetch'));
          }
        });
        cleanup = () => listener.remove();
      } catch (err) {
        console.error('Failed to register appStateChange listener:', err);
      }
    })();

    return () => cleanup?.();
  }, [queryClient]);
}
