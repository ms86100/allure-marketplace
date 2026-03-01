

# Order Flow Reliability Fix Plan

## Root Cause Analysis

### Issue 1: Buyer Cannot Cancel Before Acceptance
The `OrderCancellation` component exists and works correctly (allows cancel for `placed` and `accepted` statuses), but it is **never imported or rendered** in `OrderDetailPage.tsx`. The buyer simply never sees the cancel button.

### Issue 2: Seller Popup Disappears Without Recovery
The `NewOrderAlertOverlay` auto-dismisses after 30 seconds. It has "View Order" and "Remind me later" buttons. After dismissal, the order is still accessible via the notification bell and the orders list. This works as designed but the "Remind me later" button just dismisses (same as auto-dismiss). It should re-queue the alert.

### Issue 3: Confusing Accept Buttons
There are TWO separate status systems on the seller order detail page:
- **Item-level buttons** in `OrderItemCard.tsx`: Each order item has its own status button (e.g., "Mark Accepted") that updates `order_items.status` — this is a per-item tracking feature
- **Order-level action bar** at the bottom: "Mark Accepted" button that updates `orders.status` — this is the actual order acceptance

The item-level buttons are confusing because they look like order acceptance but only update individual item status. The "Failed to update order" error on the order-level button needs investigation — likely an RLS or trigger issue.

### Issue 4: Buyer Not Receiving Status Notifications
The notification trigger (`enqueue_order_status_notification`) correctly inserts into `notification_queue` for all status transitions. The `process-notification-queue` edge function correctly creates `user_notifications` entries. **However**, the status has never been updated past `placed` (all recent orders are still `placed`), so no buyer notifications were ever triggered. The root cause is Issue 3 — the seller cannot successfully accept orders.

### Issue 5: "Failed to Update Order" — The P0 Root Cause
The DB trigger `validate_order_status_transition` enforces `_new_sort = _current_sort + 1`. For `placed→accepted` in `food/cart_purchase`, sort is `1→2` which should pass. The likely failure is that the update is being rejected by RLS policies (the seller's authenticated user must match). Need to verify the update query in `useOrderDetail.ts` — it updates `orders` table with `.eq('id', order.id)` but does NOT filter by seller. RLS may be blocking if the policy requires the seller's user_id match.

---

## Changes Required

### 1. Add OrderCancellation to OrderDetailPage (Issue 1)
**File:** `src/pages/OrderDetailPage.tsx`
- Import `OrderCancellation` component
- Render it in the buyer view section when order status is `placed` (before acceptance only, matching Zomato/Swiggy pattern)
- Place it prominently below the status timeline card
- On cancellation, refresh the order data

### 2. Hide Item-Level Status Buttons (Issue 3)
**File:** `src/components/order/OrderItemCard.tsx`
- Remove the per-item "Mark Accepted/Preparing/Ready" button and the dropdown status selector from the seller view
- These create confusion with the order-level action bar
- Item status should auto-sync with order status or be removed entirely
- Keep only the status badge display (read-only)

### 3. Debug and Fix "Failed to Update Order" (Issue 3 & 5)
**File:** `src/hooks/useOrderDetail.ts`
- The `updateOrderStatus` function updates orders with `.eq('id', order.id)` only
- Need to verify RLS allows seller to update. Check if there's an RLS policy requiring specific column match
- Add better error logging to capture the actual DB error message
- Also ensure `auto_cancel_at: null` is set correctly (currently done)

**Database:** Check and fix RLS policies on orders table for seller updates

### 4. Improve Seller Alert Recovery (Issue 2)
**File:** `src/components/seller/NewOrderAlertOverlay.tsx`
- The "Remind me later" (snooze) behavior already exists via `onSnooze` prop
- Verify the snooze handler in `useNewOrderAlert.ts` actually re-queues the order for a later alert
- If not, implement proper re-queue with a short delay (e.g., 2 minutes)

### 5. Verify Notification Pipeline (Issue 4)
This will self-resolve once Issue 3 is fixed (seller can accept orders). The notification trigger and queue processing are correctly implemented. Once orders transition from `placed→accepted→preparing→ready`, the buyer will receive in-app notifications automatically.

---

## Technical Details

### RLS Investigation
```sql
-- Check current RLS policies on orders table for UPDATE
SELECT policyname, qual, with_check 
FROM pg_policies 
WHERE tablename = 'orders';
```

The seller update likely fails because the orders table RLS may require `buyer_id = auth.uid()` for updates, not allowing sellers to update. Need to verify and add a seller update policy if missing.

### Order of Implementation
1. Query RLS policies to identify the update failure cause
2. Fix RLS if needed (DB migration)
3. Remove item-level status buttons from OrderItemCard
4. Add OrderCancellation to buyer view in OrderDetailPage
5. Improve snooze behavior in NewOrderAlertOverlay

