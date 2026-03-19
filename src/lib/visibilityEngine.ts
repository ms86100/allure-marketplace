/**
 * Visibility Engine — Deterministic UI Surface Rules
 *
 * Centralizes route-based visibility so components don't hardcode
 * their own hide/show logic independently.
 *
 * Rules:
 *   • FloatingCartBar: visible when cart has items AND not on cart/checkout
 *   • ActiveOrderETA (header): visible when active order AND not on order detail
 *   • ActiveOrderStrip (home): visible when active order AND on home page
 */

export const CART_HIDDEN_ROUTES = ['/cart', '/checkout'] as const;
export const ETA_HIDDEN_ROUTE_PREFIXES = ['/orders/'] as const;

/**
 * Returns true if the given pathname should hide the element.
 * Supports both exact prefix matching and starts-with matching.
 */
export function isRouteHidden(
  pathname: string,
  hiddenPrefixes: readonly string[],
): boolean {
  return hiddenPrefixes.some((prefix) => pathname.startsWith(prefix));
}

/** Transit statuses that indicate active movement — used for activity pulse */
export const TRANSIT_STATUSES = new Set([
  'on_the_way',
  'out_for_delivery',
  'at_gate',
  'in_transit',
] as const);
