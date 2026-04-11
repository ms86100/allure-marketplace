

# Root Cause Analysis & Fix Plan

## Issue 1: No OTP for Buyer / Seller Can't Enter OTP

**Root Cause**: The `delivery_assignments` row was never created for this order. The trigger function `trg_create_seller_delivery_assignment` has a guard:

```sql
_resolved_society := COALESCE(_buyer_society, NEW.society_id, _seller_society);
IF _resolved_society IS NULL THEN RETURN NEW; END IF;
```

Both the buyer (`b3220352`) and seller (`68a6cc09`) have `society_id = NULL`. The order also has `society_id = NULL`. So `_resolved_society` resolves to NULL, and the trigger exits **without creating the delivery_assignment**.

No delivery_assignment means:
- No `delivery_code` generated → buyer has no OTP to show
- No `deliveryAssignmentId` in frontend → seller OTP dialog never triggers
- The generic OTP fallback at line 763 should catch this, but it also checks `!deliveryAssignmentId` AND `!buyerOtp` — both true, so it should show GenericOtpCard. Need to verify this path works or if there's another guard blocking it.

**Fix**: Remove the `society_id IS NULL` early return from the trigger. The `society_id` column in `delivery_assignments` is nullable, so just allow NULL. Also backfill the missing assignment for this order.

## Issue 2: Live Map Unavailable

**Root Cause**: Same cascading failure. No `delivery_assignments` row means `deliveryAssignmentId` is null. The map component at line 694-706 only renders when `deliveryAssignmentId` is truthy. Instead, line 707-713 shows "Setting up live tracking..." or the fallback "Live map unavailable" card renders from `DeliveryMapView`. No assignment = no GPS data = no map.

**Fix**: Once the trigger creates the assignment, GPS tracking and map will work. No frontend map changes needed.

## Issue 3: Workflow Too Long (Completed after Delivered)

Already identified — `completed` (sort_order 80) and `payment_pending` (85) show after `delivered`. The stepper filter should hide these but they're still visible in the screenshot.

---

## Fix Plan

### Migration (1 SQL file)

1. **Fix trigger**: Remove the `society_id IS NULL` guard — allow `society_id` to be NULL in the delivery_assignment insert.

2. **Backfill**: Create the missing delivery_assignment for order `cf416e7a-30e6-45be-aef3-7b3d22b185f4` (and any other seller_delivery orders in transit/delivered that lack one).

3. **Workflow cleanup**: Delete the `completed` step (sort_order 80) from `seller_delivery` workflow and update the `delivered` step to be `is_terminal: true, is_success: true`. Update the transition so `delivered` doesn't flow to `completed`. This shortens the visible workflow.

### Frontend

4. **Verify stepper filtering**: Ensure the horizontal rail stepper in `LiveActivityCard.tsx` and `OrderDetailPage.tsx` filters out `completed` and `payment_pending` steps. If the DB cleanup in step 3 removes them, no frontend change needed.

5. **Generic OTP fallback guard**: Double-check the buyer-side GenericOtpCard fallback at lines 762-777 actually renders when there's no delivery assignment. If there's a condition preventing it (e.g., `isDeliveryOrder` check or `isInTransit` guard), fix it.

---

## Technical Details

| Change | Location |
|--------|----------|
| Remove society_id NULL guard from trigger | SQL migration — `trg_create_seller_delivery_assignment` |
| Backfill delivery_assignments for orders missing them | SQL migration — one-time INSERT |
| Remove `completed` step from seller_delivery workflow | SQL migration — DELETE from `category_status_flows` |
| Make `delivered` the terminal success step | SQL migration — UPDATE `category_status_flows` |
| Verify/fix buyer OTP fallback rendering | `src/pages/OrderDetailPage.tsx` lines 762-777 |

### Key SQL change:
```sql
-- BEFORE (broken):
_resolved_society := COALESCE(_buyer_society, NEW.society_id, _seller_society);
IF _resolved_society IS NULL THEN RETURN NEW; END IF;

-- AFTER (fixed):
_resolved_society := COALESCE(_buyer_society, NEW.society_id, _seller_society);
-- Allow NULL society_id — delivery assignments don't require it
```

