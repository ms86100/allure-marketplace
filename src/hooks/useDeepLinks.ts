import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App, URLOpenListenerEvent } from '@capacitor/app';

const PENDING_DEEP_LINK_KEY = 'sociva_pending_deep_link';

/**
 * Known top-level route segments used for deep-link fallback validation.
 */
const KNOWN_ROUTES = new Set([
  'orders', 'order', 'home', 'profile', 'cart', 'shop',
  'seller', 'settings', 'notifications', 'tracking', 'la-debug',
]);

/**
 * Store a pending deep link path for deferred navigation after auth hydration.
 */
export function setPendingDeepLink(path: string) {
  try {
    sessionStorage.setItem(PENDING_DEEP_LINK_KEY, path);
  } catch { /* storage unavailable */ }
}

/**
 * Consume and clear the pending deep link. Returns null if none.
 */
export function consumePendingDeepLink(): string | null {
  try {
    const path = sessionStorage.getItem(PENDING_DEEP_LINK_KEY);
    if (path) sessionStorage.removeItem(PENDING_DEEP_LINK_KEY);
    return path;
  } catch {
    return null;
  }
}

/**
 * Hook to handle deep links in Capacitor native apps
 *
 * Supports:
 * - Custom URL scheme: sociva://orders/123
 * - Universal Links (iOS): https://sociva.app/#/orders/123
 * - App Links (Android): https://sociva.app/#/orders/123
 *
 * Since the app uses HashRouter, deep link paths are extracted from:
 * 1. The hash fragment (e.g., /#/orders/123 -> /orders/123)
 * 2. hostname+pathname for custom schemes (sociva://orders/123 → /orders/123)
 *
 * Deep links are stored in sessionStorage so they survive auth hydration.
 */
export function useDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleDeepLink = (event: URLOpenListenerEvent) => {
      console.log('Deep link received:', event.url);

      try {
        const url = new URL(event.url);
        let path = '';

        // Check if URL has a hash (for universal links with HashRouter)
        if (url.hash && url.hash.startsWith('#/')) {
          path = url.hash.substring(1);
        } else if (url.protocol === 'sociva:') {
          // Custom URL scheme: sociva://orders/123
          const host = url.hostname;
          const rest = url.pathname;
          path = `/${host}${rest === '/' ? '' : rest}`;
          if (url.search) {
            path += url.search;
          }
        } else {
          // Universal link without hash, use pathname
          path = url.pathname;
          if (url.search) {
            path += url.search;
          }
        }

        if (path && path !== '/') {
          // Validate the top-level route segment exists
          const topSegment = path.split('/').filter(Boolean)[0];
          if (topSegment && !KNOWN_ROUTES.has(topSegment)) {
            console.warn('Deep link: unknown route segment', topSegment, '→ fallback to /orders');
            path = '/orders';
          }

          console.log('Deep link path resolved:', path);

          // Always store as pending — the deferred consumer will navigate
          // after auth is ready. Also attempt immediate navigation for
          // cases where auth is already hydrated.
          setPendingDeepLink(path);
          navigate(path);
        }
      } catch (error) {
        console.error('Error parsing deep link:', error);
        setPendingDeepLink('/orders');
        navigate('/orders');
      }
    };

    // Listen for app URL open events
    const listenerPromise = App.addListener('appUrlOpen', handleDeepLink);

    // Check if app was opened via deep link (cold start)
    App.getLaunchUrl().then((launchUrl) => {
      if (launchUrl?.url) {
        console.log('App launched via deep link:', launchUrl.url);
        handleDeepLink({ url: launchUrl.url });
      }
    });

    // Cleanup listener on unmount
    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [navigate]);
}
