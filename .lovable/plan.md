

## P0 Fix: Prevent Seller Notification Before Payment Completion

### Root Cause

The order creation flow has a critical sequencing flaw for online payments (Razorpay/UPI):

1. **Buyer taps "Place Order"** → `create_multi_vendor_orders` RPC is called with `_payment_status = 'pending'`
2. **RPC inserts the order** with `status = 'placed'` immediately — regardless of payment status
3. **Three notification paths fire instantly:**
   - The RPC itself inserts into `notification_queue` (seller push notification)
   - Realtime subscription in `useNewOrderAlert` detects the INSERT with `status = 'placed'` → buzzer fires
   - Polling fallback also picks up orders with `status = 'placed'`
4. **Payment hasn't happened yet** — buyer is still on the Razorpay/UPI screen

For COD orders, this is correct (payment is implicit). For online payments, the seller gets notified before the buyer has paid.

### Solution

Introduce a new `payment_pending` order status that acts as a "holding" state for unpaid online orders. Seller-facing alerts will ignore this status.

### Changes

**1. Add `payment_pending` enum value**
- Add `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'payment_pending'` via migration

**2. Update `create_multi_vendor_orders` RPC**
- When `_payment_status = 'pending'` (online payment), insert order with `status = 'payment_pending'` instead of `'placed'`
- When `_payment_status` is anything else (COD), keep `status = 'placed'`
- **Skip** the `notification_queue` insert when status is `'payment_pending'` — no seller notification yet

**3. Transition to `placed` after payment confirmation**
- In the Razorpay webhook (`payment.captured` handler): after marking `payment_status = 'paid'`, also update `status` from `'payment_pending'` to `'placed'`
- This UPDATE triggers the existing realtime subscription and notification triggers
- In the UPI deep link success handler: same pattern — update status to `'placed'` after payment confirmation

**4. Handle payment failure/abandonment**
- Razorpay `payment.failed` webhook: orders stay in `payment_pending` (existing auto-cancel cron will clean them up)
- Client-side `handleRazorpayFailed`: the existing `buyer_cancel_pending_orders` RPC already cancels these
- No seller notification ever fires for abandoned payments

**5. `useNewOrderAlert` — no changes needed**
- `ACTIONABLE_STATUSES` already only includes `['placed', 'enquired', 'quoted']`
- `payment_pending` is naturally excluded — sellers won't see or hear anything

**6. Auto-cancel edge function**
- Verify it also handles `payment_pending` status orders (treat same as current pending logic)

**7. Order status config seed**
- Add `payment_pending` to `order_status_config` table with a buyer-facing label like "Awaiting Payment"

### Files to Modify
- **New migration SQL**: Add enum value, update RPC, add status config row
- **`supabase/functions/razorpay-webhook/index.ts`**: Update `payment.captured` to also set `status = 'placed'`
- **`src/hooks/useCartPage.ts`**: In `handleRazorpaySuccess` and `handleUpiDeepLinkSuccess`, update order status to `'placed'` as a client-side fallback (webhook is primary)
- **Auto-cancel function**: Include `payment_pending` in cancellation scope

### Edge Cases Covered
- **Payment succeeds**: webhook updates `payment_pending` → `placed`, seller gets notified
- **Payment fails**: client cancels orders, or auto-cancel cron cleans up — no seller alert
- **Payment abandoned**: auto-cancel cron handles cleanup after 30 min
- **COD**: unchanged flow — orders created as `placed` immediately
- **Webhook arrives before client**: works fine — status transitions happen atomically
- **Client success but webhook delayed**: client-side fallback also updates to `placed`

