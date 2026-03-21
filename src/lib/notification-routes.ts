/**
 * Centralized notification-type → route resolver.
 * Used as fallback when `reference_path` is missing from a notification payload.
 */
export function resolveNotificationRoute(
  type: string | undefined | null,
  payload?: Record<string, any>,
): string {
  if (!type) return '/notifications';

  switch (type) {
    // Seller lifecycle
    case 'seller_approved':
      return '/seller';
    case 'seller_rejected':
      return '/become-seller';
    case 'seller_suspended':
      return '/seller';

    // Order lifecycle
    case 'order_created':
    case 'order_status':
    case 'order_update': {
      const orderId = payload?.orderId || payload?.order_id || payload?.entity_id;
      return orderId ? `/orders/${orderId}` : '/orders';
    }

    // Product moderation
    case 'product_approved':
    case 'product_rejected':
      return '/seller';

    // License moderation
    case 'license_approved':
    case 'license_rejected':
      return '/seller';

    // Admin / moderation
    case 'moderation':
    case 'new_store_application':
      return '/admin';

    default:
      return '/notifications';
  }
}
