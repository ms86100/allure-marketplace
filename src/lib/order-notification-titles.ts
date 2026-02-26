/**
 * E5: Centralized notification title map.
 * This MUST stay in sync with the `enqueue_order_status_notification` DB trigger.
 * If you change titles here, update the trigger too (and vice versa).
 */

export const ORDER_NOTIF_TITLES_BUYER: Record<string, string> = {
  accepted: '✅ Order Accepted!',
  preparing: '👨‍🍳 Order Being Prepared',
  ready: '🎉 Order Ready!',
  picked_up: '📦 Order Picked Up',
  delivered: '🚚 Order Delivered',
  completed: '⭐ Order Completed',
  cancelled: '❌ Order Cancelled',
  quoted: '💰 Quote Received',
  scheduled: '📅 Booking Confirmed',
};

export const ORDER_NOTIF_TITLES_SELLER: Record<string, string> = {
  placed: '🆕 New Order Received!',
  enquired: '📋 New Booking Request!',
  cancelled: '❌ Order Cancelled',
};

export function getOrderNotifTitle(status: string, role: 'buyer' | 'seller'): string | null {
  const map = role === 'seller' ? ORDER_NOTIF_TITLES_SELLER : ORDER_NOTIF_TITLES_BUYER;
  return map[status] || null;
}
