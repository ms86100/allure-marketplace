

# Fix Plan: 3 Production Issues — Evidence-Based Root Cause Analysis

## Issue 1: Notifications Unreliable

### Root Cause A: Empty Seller Notification Body (VERIFIED)

Database evidence from `category_status_flows`:
- `placed` status → `seller_notification_body: NULL`
- `enquired` status → `seller_notification_body: NULL`

The trigger sends an empty body to `notification_queue`. The `send-push-notification` function then sends a push with an empty body string, which causes intermittent APNs/FCM rejections (the `non-2xx status code` errors in the queue).

**Evidence**: Queue rows for "🆕 New Order Received!" all have `body: ""` (empty string).

**Fix**: Data update — populate `seller_notification_body` in `category_status_flows` for `placed` and `enquired` statuses across all transaction types.

### Root Cause B: Cancellation Notifications Not Role-Aware (VERIFIED)

Database evidence:
- `cancelled` status → `notification_title: "❌ Order Cancelled"`, `notification_body: "Your order from {seller_name} has been cancelled."` — SAME text goes to both buyer and seller.
- `seller_notification_title: "❌ Order Cancelled"`, `seller_notification_body: NULL` — seller gets same title, empty body.

The trigger function does not differentiate WHO cancelled the order.

**Fix (2 parts)**:
1. Data update: Set `seller_notification_body` to `"Order #{order_number} has been cancelled by {buyer_name}."` for cancelled status.
2. Code update: Modify `fn_enqueue_order_status_notification` to detect buyer-initiated cancellations (via `rejection_reason LIKE 'Cancelled by buyer:%'`) and adjust the seller notification title to "❌ Order Cancelled by Buyer" vs generic "❌ Order Cancelled".

---

## Issue 2: Payment Flow — "Order Cancelled" After UPI Payment

### Root Cause (VERIFIED)

Database evidence: Order `5edf65d5` — Razorpay payment was captured (confirmed in edge function logs), but order status is `cancelled` with reason "payment was not completed in time". `payment_status` remains `pending`.

Race condition timeline:
1. Buyer creates order → `status: payment_pending, payment_status: pending`
2. Buyer completes payment via Razorpay
3. `auto-cancel-orders` runs (30-min sweep), sees `payment_status: pending` → cancels order
4. Razorpay webhook / confirm function arrives → order already cancelled, guard rejects update

The `isRazorpayPaid()` check in auto-cancel should prevent this, but there's a timing gap: if the check runs while Razorpay is still processing the capture, it returns false.

**Fix**: In `auto-cancel-orders/index.ts`, add a grace period for Razorpay orders — skip auto-cancel for any order with a non-null `razorpay_order_id` that is younger than 45 minutes (currently 30 minutes). This gives the webhook/confirm flow sufficient time.

Additionally, in `confirm-razorpay-payment/index.ts`, add a resurrection path: if the order status is `cancelled` but `payment_status` is still `pending`, AND Razorpay confirms payment was captured, update the order back to `placed` with `payment_status: paid`. This is the safety net for the race condition.

**About the "unnecessary popup"**: The confirm dialog ("Confirm Your Order") before payment is standard checkout UX showing order summary. It is not a bug — it's intentional design. No change needed.

---

## Issue 3: iOS Background Location

### Root Cause (VERIFIED)

The error "Background geolocation plugin is not implemented on iOS" occurs because the `UIBackgroundModes` array in `Info.plist` does not include the `location` entry. The Transistorsoft plugin requires this entitlement to function in the background.

**Fix**: This is a **build configuration change** in `codemagic.yaml` — inject `UIBackgroundModes: location` into the `Info.plist` during the build process. This requires a TestFlight rebuild and cannot be fixed via code alone.

---

## Implementation Details

### Database Updates (via insert tool — data changes, not schema)

Update `category_status_flows` rows:

```sql
-- Fix empty seller body for 'placed' status
UPDATE category_status_flows
SET seller_notification_body = '{buyer_name} placed an order. Tap to view and accept.'
WHERE status_key = 'placed'
  AND seller_notification_body IS NULL;

-- Fix empty seller body for 'enquired' status
UPDATE category_status_flows
SET seller_notification_body = '{buyer_name} sent a new enquiry. Tap to view.'
WHERE status_key = 'enquired'
  AND seller_notification_body IS NULL;

-- Fix cancellation: role-aware seller body
UPDATE category_status_flows
SET seller_notification_body = 'Order #{order_number} from {buyer_name} has been cancelled.'
WHERE status_key = 'cancelled'
  AND seller_notification_body IS NULL;
```

### DB Trigger Update (migration)

Modify `fn_enqueue_order_status_notification` to detect buyer cancellations via `rejection_reason` and override the seller notification title:

```sql
-- After computing v_seller_title for 'cancelled' status:
IF NEW.status = 'cancelled' AND NEW.rejection_reason LIKE 'Cancelled by buyer:%' THEN
  v_seller_title := '❌ Cancelled by Buyer';
END IF;
```

### Edge Function: `auto-cancel-orders/index.ts`

Add Razorpay grace period (line ~99):
```typescript
// Skip Razorpay orders younger than 45 minutes (give webhook time)
const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();

// Orphaned UPI query: increase threshold for Razorpay orders
const { data: orphanedUpi } = await supabase
  .from("orders")
  .select("id, buyer_id, seller_id, total_amount, razorpay_order_id")
  .in("status", cancellableStatuses)
  .eq("payment_status", "pending")
  .neq("payment_type", "cod")
  .lt("created_at", fortyFiveMinAgo);  // Changed from 30 to 45 min
```

### Edge Function: `confirm-razorpay-payment/index.ts`

Add resurrection for cancelled-but-paid orders in the state-guarded update section — if the initial update fails (order already cancelled), check if it's recoverable and update:

```typescript
if (!updatedOrder || updatedOrder.length === 0) {
  // Resurrection: if order was auto-cancelled but payment is genuine
  const { data: cancelledOrder } = await supabase
    .from('orders')
    .select('id, status, payment_status')
    .eq('id', orderId)
    .eq('status', 'cancelled')
    .eq('payment_status', 'pending')
    .single();

  if (cancelledOrder) {
    await supabase.from('orders').update({
      status: 'placed',
      payment_status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      rejection_reason: null,
    }).eq('id', orderId).eq('status', 'cancelled');
    console.log(`[confirm-razorpay] ✅ Resurrected cancelled order ${orderId}`);
  }
}
```

### iOS Background Location

Update `codemagic.yaml` to add `location` to `UIBackgroundModes`:
```yaml
# Under iOS build scripts, add to Info.plist manipulation:
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:0 string location" ios/App/App/Info.plist
```

---

## Files Changed

| File | Change | Risk |
|------|--------|------|
| `category_status_flows` (data) | Populate seller_notification_body for placed/enquired/cancelled | None — additive |
| DB migration | Update fn_enqueue_order_status_notification for role-aware cancel | Low — additive guard |
| `supabase/functions/auto-cancel-orders/index.ts` | Increase grace period to 45 min | Low — only delays auto-cancel |
| `supabase/functions/confirm-razorpay-payment/index.ts` | Add resurrection for cancelled-but-paid orders | Medium — tested path |
| `codemagic.yaml` | Add UIBackgroundModes location | Low — requires rebuild |

## Validation

1. Place COD order → seller receives push with body text "{buyer_name} placed an order..."
2. Place Razorpay order → seller receives push with body text
3. Buyer cancels → seller push says "❌ Cancelled by Buyer" with body "Order #XYZ from {buyer_name} has been cancelled"
4. Seller cancels → buyer push says "❌ Order Cancelled" with body "Your order from {seller_name} has been cancelled"
5. Complete Razorpay payment → order transitions to placed (never auto-cancelled)
6. If auto-cancel races → confirm function resurrects the order
7. Rebuild iOS → background location works with no error message

