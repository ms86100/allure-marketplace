import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App, URLOpenListenerEvent } from '@capacitor/app';

/**
 * Known top-level route segments used for deep-link fallback validation.
 */
const KNOWN_ROUTES = new Set([
  'orders', 'order', 'home', 'profile', 'cart', 'shop',
  'seller', 'settings', 'notifications', 'tracking', 'la-debug',
]);

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
          // Extract path from hash: https://domain.com/#/orders/123 -> /orders/123
          path = url.hash.substring(1); // Remove the leading #
        } else if (url.protocol === 'sociva:') {
          // Custom URL scheme: sociva://orders/123
          // new URL('sociva://orders/123') parses hostname='orders', pathname='/123'
          // We need to reconstruct: /orders/123
          const host = url.hostname; // e.g. 'orders'
          const rest = url.pathname; // e.g. '/123' or '/'
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

          console.log('Navigating to:', path);
          navigate(path);
        }
      } catch (error) {
        console.error('Error parsing deep link:', error);
        // Fallback: try to navigate to orders on any parse failure
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
