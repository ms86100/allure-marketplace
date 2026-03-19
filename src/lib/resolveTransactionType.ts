/**
 * Shared utility: resolves the transaction_type key used to look up
 * category_status_flows / category_status_transitions.
 *
 * Must stay in sync with the server-side logic in buyer_advance_order RPC.
 */
export function resolveTransactionType(
  parentGroup: string,
  orderType: string | null | undefined,
  fulfillmentType?: string | null,
  deliveryHandledBy?: string | null
): string {
  if (orderType === 'enquiry') {
    if (['classes', 'events'].includes(parentGroup)) return 'book_slot';
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
