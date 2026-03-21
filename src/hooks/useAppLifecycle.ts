import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';

/**
 * Listens for Capacitor appStateChange events and invalidates critical
 * queries when the app returns to the foreground. This ensures fresh data
 * on mobile resume without relying on refetchOnWindowFocus (which fires
 * too frequently on Capacitor).
 */
export function useAppLifecycle() {
  const queryClient = useQueryClient();

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
            // Invalidate critical queries so they refetch with fresh data
            queryClient.invalidateQueries({ queryKey: ['featured-banners'] });
            queryClient.invalidateQueries({ queryKey: ['system-settings-raw'] });
            queryClient.invalidateQueries({ queryKey: ['system-settings-core'] });
            queryClient.invalidateQueries({ queryKey: ['cart-count'] });
            queryClient.invalidateQueries({ queryKey: ['cart-items'] });
            queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] });
            queryClient.invalidateQueries({ queryKey: ['products-by-category'] });
            queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
            queryClient.invalidateQueries({ queryKey: ['seller-dashboard-stats'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });

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
