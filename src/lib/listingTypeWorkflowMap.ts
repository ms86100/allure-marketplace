/**
 * Static mapping from category listing types (transaction_type in category_config)
 * to workflow engine keys (transaction_type in category_status_flows / transitions).
 *
 * This codifies the hidden logic in `resolveTransactionType` so the admin UI
 * can show which workflow pipeline a listing type triggers.
 *
 * Keep in sync with src/lib/resolveTransactionType.ts
 */
export const LISTING_TYPE_TO_WORKFLOW: Record<string, string> = {
  cart_purchase: 'cart_purchase',
  buy_now: 'cart_purchase',
  book_slot: 'service_booking',
  request_service: 'request_service',
  request_quote: 'request_service',
  contact_only: 'request_service',
  schedule_visit: 'service_booking',
};

/** Listing types where the final workflow depends on fulfillment config at order time */
export const FULFILLMENT_DEPENDENT_TYPES = new Set(['cart_purchase', 'buy_now']);

export function getWorkflowKey(listingType: string): string {
  return LISTING_TYPE_TO_WORKFLOW[listingType] ?? 'cart_purchase';
}
