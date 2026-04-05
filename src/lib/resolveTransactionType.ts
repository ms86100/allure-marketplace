// @ts-nocheck
/**
 * Shared utility: resolves the transaction_type (workflow key) for order execution.
 *
 * The `transaction_type` stored on `category_config` is now the canonical workflow key
 * selected by admins directly from available workflows in the DB.
 *
 * This function handles **runtime sub-variant resolution** for fulfillment-dependent
 * workflows (e.g. seller_delivery vs self_fulfillment within cart_purchase).
 *
 * Must stay in sync with:
 *   - Server-side logic in buyer_advance_order RPC
 *   - DB table `category_status_flows` (source of truth for workflow steps)
 */
export function resolveTransactionType(
  parentGroup: string,
  orderType: string | null | undefined,
  fulfillmentType?: string | null,
  deliveryHandledBy?: string | null,
  listingType?: string | null,
  /** Stored transaction_type from the order row (new orders have this set at creation) */
  storedTransactionType?: string | null
): string {
  // Prefer the stored transaction_type from the order (set at creation, single source of truth)
  if (storedTransactionType) return storedTransactionType;

  // Legacy fallback for orders created before the migration
  if (listingType === 'contact_enquiry') return 'contact_enquiry';

  if (orderType === 'enquiry') {
    if (['classes', 'events'].includes(parentGroup)) return 'service_booking';
    return 'request_service';
  }
  if (orderType === 'booking') return 'service_booking';

  // Fulfillment sub-variants (runtime only)
  if (fulfillmentType === 'self_pickup') return 'self_fulfillment';
  if (fulfillmentType === 'seller_delivery') return 'seller_delivery';
  if (fulfillmentType === 'delivery' && (deliveryHandledBy === 'seller' || !deliveryHandledBy)) {
    return 'seller_delivery';
  }
  if (fulfillmentType === 'delivery' && deliveryHandledBy === 'platform') return 'cart_purchase';

  if (listingType) return listingType;

  return 'self_fulfillment';
}
