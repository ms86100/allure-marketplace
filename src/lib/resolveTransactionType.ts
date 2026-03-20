/**
 * Shared utility: resolves the transaction_type key used to look up
 * category_status_flows / category_status_transitions.
 *
 * Must stay in sync with:
 *   - Server-side logic in buyer_advance_order RPC
 *   - DB table `listing_type_workflow_map` (admin-visible mapping source of truth)
 *
 * The DB table defines the *static* listing_type → workflow_key mapping visible to admins.
 * This function handles the *runtime* resolution which also considers fulfillment context.
 */
export function resolveTransactionType(
  parentGroup: string,
  orderType: string | null | undefined,
  fulfillmentType?: string | null,
  deliveryHandledBy?: string | null
): string {
  if (orderType === 'enquiry') {
    // AUDIT FIX: was 'book_slot' — no flows exist for book_slot; service_booking is correct
    if (['classes', 'events'].includes(parentGroup)) return 'service_booking';
    return 'request_service';
  }
  if (orderType === 'booking') return 'service_booking';
  if (fulfillmentType === 'self_pickup') return 'self_fulfillment';
  if (fulfillmentType === 'seller_delivery') return 'seller_delivery';
  if (fulfillmentType === 'delivery' && (deliveryHandledBy === 'seller' || !deliveryHandledBy)) {
    return 'seller_delivery';
  }
  if (fulfillmentType === 'delivery' && deliveryHandledBy === 'platform') return 'cart_purchase';
  return 'self_fulfillment';
}
