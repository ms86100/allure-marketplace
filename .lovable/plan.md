

# Fix Plan: False Cancellation Notification + Notification Hierarchy + Button Overlap

## Root Cause Analysis

### Issue 1: "Order Cancelled" appears alongside new order notifications

**This is NOT a bug in the new order flow.** The DB proves:
- Order `612abee5` (previous attempt) was legitimately cancelled at 07:04:58 — buyer abandoned UPI payment
- Order `4c8909fa` (new order) correctly triggered "New Order Received" at 07:05:30

The problem: when the buyer's previous order attempt fails and gets cancelled via `buyer_cancel_pending_orders`, the seller receives a cancellation notification for that abandoned order. Seconds later, the buyer retries and places a new order. Both notifications arrive on the lock screen simultaneously, making it look like the new order was cancelled.

**Fix**: Suppress seller cancellation notifications for orders that were **never seen by the seller** — i.e., orders cancelled while still in `payment_pending` status. If the seller never received a "New Order" notification (because the order never reached `placed`), they should not receive a cancellation notification either.

### Issue 2: Notification hierarchy wrong

The current order is correct — "New Order Received" at 07:05:30, then "Payment Confirmation Needed" at 07:05:33. But the **cancelled notification from the old order** (07:04:58) arrives first and gets displayed on top in iOS notification shade (newest-on-top). This creates the visual impression of: cancel → payment needed, instead of: new order → payment needed.

**Fix**: Same as Issue 1 — suppressing the phantom cancellation eliminates the wrong hierarchy.

### Issue 3: Reject/Mark Accepted buttons overlap on scroll

The action bar uses `fixed bottom-[calc(4rem+env(safe-area-inset-bottom))]` positioning (line 746), which should work. But the page content scrolls underneath without enough bottom padding, causing the buttons to visually overlap the last content items (Total section).

**Fix**: Add bottom padding to the scrollable content area equal to the action bar height to prevent overlap.

## Implementation

### Step 1: Suppress seller notifications for never-placed cancellations
**File**: DB migration — update `fn_enqueue_order_status_notification()`

Add a guard at the top of the cancellation notification path: if `NEW.status = 'cancelled'` AND `OLD.status = 'payment_pending'`, skip the seller notification. The order never reached `placed`, so the seller was never told about it and should not receive a cancellation alert.

```sql
-- Inside fn_enqueue_order_status_notification, before the seller notification block:
-- If order is being cancelled from payment_pending, seller never knew about it — skip seller notif
IF NEW.status = 'cancelled' AND OLD.status = 'payment_pending' THEN
  v_notify_seller := false;
END IF;
```

### Step 2: Also suppress buyer "cancelled" notification for payment_pending → cancelled
The buyer already sees "Payment was not completed" toast on their screen. Sending a separate push notification saying "Your order has been cancelled" is redundant and confusing.

Same guard applied to buyer notifications:
```sql
IF NEW.status = 'cancelled' AND OLD.status = 'payment_pending' THEN
  v_notify_buyer := false;
  v_notify_seller := false;
END IF;
```

### Step 3: Fix button overlap with content
**File**: `src/pages/OrderDetailPage.tsx`

Add bottom padding to the scrollable content container when the action bar is visible, so the Total/Instructions section doesn't get hidden behind the fixed buttons.

```tsx
{/* Add padding when action bar is shown */}
<div className={cn(
  "...",
  (hasSellerActionBar || hasBuyerActionBar) && "pb-24"
)}>
```

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Suppress notifications for `payment_pending → cancelled` transitions |
| `src/pages/OrderDetailPage.tsx` | Add bottom padding when action bar is visible |

## Expected Result
- Seller no longer receives "Order Cancelled" for orders that never reached them
- New order notification is the first and only notification seller sees for a fresh order
- Reject/Mark Accepted buttons no longer overlap with page content on scroll

