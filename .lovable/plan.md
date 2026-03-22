

## ✅ COMPLETED: P0 Fix — Prevent Seller Notification Before Payment Completion

### What was done

1. **Added `payment_pending` enum value** to `order_status` — new holding state for unpaid online orders
2. **Updated `create_multi_vendor_orders` RPC** — online payments now create orders with `status = 'payment_pending'` instead of `'placed'`, and seller notification is skipped
3. **Updated Razorpay webhook** (`payment.captured`) — transitions `payment_pending` → `placed` and queues seller notification only after payment confirmation
4. **Updated `useCartPage.ts`** — client-side fallback transitions `payment_pending` → `placed` in both `handleRazorpaySuccess` and `handleUpiDeepLinkSuccess`
5. **Updated auto-cancel function** — includes `payment_pending` in cancellable statuses for cleanup
6. **Seeded `order_status_config`** — added "Awaiting Payment" label for buyer-facing display

### Flow after fix

- **COD**: Order created as `placed` → seller notified immediately ✅
- **Online payment**: Order created as `payment_pending` → no seller alert → payment succeeds → webhook/client transitions to `placed` → seller notified ✅
- **Payment failed/abandoned**: Order stays `payment_pending` → auto-cancel cleans up → no seller alert ✅
