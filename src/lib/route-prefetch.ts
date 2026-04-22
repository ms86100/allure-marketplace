// @ts-nocheck
/**
 * Idle-time route prefetcher. Warms up dynamic-import chunks for likely-next
 * routes after the current page has painted, so navigations feel instant.
 *
 * Usage:
 *   useEffect(() => { prefetchLikelyRoutes(); }, []);
 */

const PREFETCH_KEYS = new Set<string>();

type Importer = () => Promise<unknown>;

function whenIdle(cb: () => void, timeout = 2000) {
  if (typeof window === 'undefined') return;
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) {
    ric(cb, { timeout });
  } else {
    setTimeout(cb, 1500);
  }
}

function prefetch(key: string, importer: Importer) {
  if (PREFETCH_KEYS.has(key)) return;
  PREFETCH_KEYS.add(key);
  importer().catch((err) => {
    // Don't keep the key if it failed — allow retry on next navigation
    PREFETCH_KEYS.delete(key);
    console.debug('[prefetch] failed for', key, err);
  });
}

/**
 * Prefetch the most-likely-next routes from Home.
 * Schedule each on its own idle slot so we don't hog the main thread.
 */
export function prefetchBuyerRoutes() {
  whenIdle(() => prefetch('orders', () => import('@/pages/OrdersPage')));
  whenIdle(() => prefetch('cart', () => import('@/pages/CartPage')));
  whenIdle(() => prefetch('search', () => import('@/pages/SearchPage')));
  whenIdle(() => prefetch('profile', () => import('@/pages/ProfilePage')));
  whenIdle(() => prefetch('seller-detail', () => import('@/pages/SellerDetailPage')));
  whenIdle(() => prefetch('product', () => import('@/pages/ProductDeepLinkPage')));
  whenIdle(() => prefetch('notifications', () => import('@/pages/NotificationsPage')));
}
