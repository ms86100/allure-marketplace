

# Round 29: Five Critical Bugs — Detective Audit

## Root Cause Analysis

The **single deadliest bug** is in the `fn_enqueue_order_status_notification` trigger. It references **three sets of non-existent columns**, causing **every order status transition** in the system to fail with a hard rollback. This is why sellers can't accept orders and buyers can't cancel.

---

## Bug 1 (P0-BLOCKER): Notification trigger references non-existent `order_number` column

**Error:** `record "new" has no field "order_number"`

**What happens:** The `fn_enqueue_order_status_notification` AFTER UPDATE trigger on `orders` executes line 37: `v_order_number := COALESCE(NEW.order_number, LEFT(NEW.id::text, 8))`. The `orders` table has no `order_number` column. PostgreSQL raises an error, the entire transaction rolls back, and the status update never persists.

**Why critical:** This blocks ALL order lifecycle transitions — accept, prepare, ready, deliver, cancel, complete. The marketplace is effectively frozen. Every seller sees "Failed to update order" and every buyer sees "Failed to cancel order."

**Affected modules:** Order detail page (seller actions), buyer cancel flow, auto-cancel cron, delivery flow, auto-complete, payment confirmation — literally every status change.

**Fix:** Replace `COALESCE(NEW.order_number, LEFT(NEW.id::text, 8))` with `LEFT(NEW.id::text, 8)`.

**Risk:** None — `order_number` never existed, so the fallback was always the intended behavior.

---

## Bug 2 (P0-BLOCKER): Same trigger references non-existent `requires_delivery` column

**Where:** Lines 67-68, 72, 81 in the trigger use `NEW.requires_delivery`. The `orders` table uses `fulfillment_type` and `delivery_handled_by` instead.

**What happens:** Even if Bug 1 is fixed, the trigger would crash at the `CASE` statement with the same class of error. The transaction type resolution is completely broken.

**Why critical:** Same blast radius as Bug 1 — all transitions blocked.

**Affected modules:** Same as Bug 1.

**Fix:** Replace the `requires_delivery`-based CASE with logic matching `validate_order_status_transition` (which works correctly):
```sql
IF NEW.order_type = 'enquiry' THEN
  IF COALESCE(v_parent_group, 'default') IN ('classes', 'events') THEN
    v_transaction_type := 'book_slot';
  ELSE v_transaction_type := 'request_service'; END IF;
ELSIF NEW.order_type = 'booking' THEN v_transaction_type := 'service_booking';
ELSIF NEW.fulfillment_type = 'self_pickup' THEN v_transaction_type := 'self_fulfillment';
ELSIF NEW.fulfillment_type = 'delivery' AND COALESCE(NEW.delivery_handled_by, 'seller') = 'seller' THEN v_transaction_type := 'seller_delivery';
ELSIF NEW.fulfillment_type = 'seller_delivery' THEN v_transaction_type := 'seller_delivery';
ELSIF NEW.fulfillment_type = 'delivery' AND NEW.delivery_handled_by = 'platform' THEN v_transaction_type := 'cart_purchase';
ELSE v_transaction_type := 'self_fulfillment';
END IF;
```

Also fix the cart-based multi-item block (line 80-83) which uses `NEW.requires_delivery`:
```sql
IF ... THEN
  v_transaction_type := CASE
    WHEN NEW.fulfillment_type IN ('delivery', 'seller_delivery') THEN 'cart_purchase'
    ELSE 'self_fulfillment'
  END;
END IF;
```

**Risk:** Must exactly match `validate_order_status_transition` logic or notifications will target wrong workflow configs. I'll copy the proven logic from that trigger verbatim.

---

## Bug 3 (P0): Trigger references `profiles.full_name` and `profiles.username` — columns don't exist

**Where:** Line 46: `SELECT COALESCE(p.full_name, p.username, 'Customer')`. The `profiles` table only has a `name` column (confirmed via schema check).

**What happens:** Even with Bugs 1 & 2 fixed, this would crash the trigger with `column "full_name" does not exist`.

**Why critical:** Third sequential blocker preventing any order transition.

**Fix:** Change to `SELECT COALESCE(p.name, 'Customer')`.

**Risk:** None.

---

## Bug 4 (P1): Buyer phone number exposed to all authenticated users via notification payloads

**Where:** The `BuyerCancelBooking` component (line 108-118) fetches `seller_profiles.user_id` and inserts into `notification_queue` with the order path. More critically, the order detail query (visible in network requests) returns full buyer profile including `phone: "+919535115316"` to any authenticated user who can access the order. The `profiles` table RLS likely allows read access to all authenticated users.

**What happens:** Any authenticated user could query `profiles` and see phone numbers, violating privacy.

**Why critical:** PII exposure — phone numbers are sensitive personal data. This violates trust and potentially DPDP Act compliance.

**Affected modules:** Order detail page, notification payloads, profile queries.

**Fix:** Audit `profiles` RLS — ensure phone is not exposed in general SELECT policies. Consider a view that excludes phone for non-order-party queries. This is a larger fix and should be planned separately, but flagged as P1.

**Risk:** Restricting profile access could break seller/buyer name display. Need surgical RLS that allows name but restricts phone to order participants only.

---

## Bug 5 (P1): Home page renders empty skeleton cards (screenshot 3)

**Where:** Screenshot 3 shows the home page with two large empty gray rectangles and bottom nav. This suggests the home page's main content (seller cards, product listings, or banner carousels) failed to load or rendered without data.

**What happens:** On a fresh registration or when the user's location/society data isn't set, the home page may render skeleton placeholders that never resolve — either because queries return empty results and the loading state isn't properly cleared, or because the content depends on society assignment which may not have occurred yet.

**Why critical:** First impression for new users is a blank page with mysterious gray boxes. This is a trust-killer for a marketplace app.

**Affected modules:** Home page, seller discovery, onboarding flow.

**Fix:** Need to investigate the home page component to determine if this is a data issue (no sellers in the user's area) or a rendering bug (loading state stuck). The fix would be either proper empty states or ensuring the loading skeleton transitions to content/empty-state correctly.

**Risk:** Low — this is a UI state management fix.

---

## Impact Analysis: What Gets Unblocked by Fixing Bugs 1-3

Fixing the notification trigger (Bugs 1-3 together, single migration) unblocks:
- Seller accepting/rejecting orders
- Seller advancing orders through all workflow stages
- Buyer cancelling orders
- Auto-cancel cron job
- Auto-complete logic
- Delivery flow (picked up, on the way, delivered)
- Service booking lifecycle
- Payment confirmation flows
- All in-app notifications for order status changes

**Cascading risk from the fix:** The notification trigger now fires correctly, which means `notification_queue` will start receiving entries. The `process-notification-queue` edge function and the cron sweep will begin processing them. If there's a backlog of failed operations that users retry, there could be a burst of notifications. This is acceptable — users will finally get the status updates they've been missing.

---

## Implementation Plan

### Migration 1: Fix `fn_enqueue_order_status_notification` (Bugs 1, 2, 3)

Single `CREATE OR REPLACE FUNCTION` that:
1. Replaces `NEW.order_number` with `LEFT(NEW.id::text, 8)`
2. Replaces `p.full_name, p.username` with `p.name`
3. Replaces all `NEW.requires_delivery` logic with the proven `validate_order_status_transition` pattern using `NEW.fulfillment_type` and `NEW.delivery_handled_by`

### Bug 4: Profile privacy (separate follow-up)
Requires RLS policy audit and potentially a view — plan separately.

### Bug 5: Home page empty state (requires investigation)
Need to inspect the home page component to determine root cause before proposing a fix.

---

## Files to Edit

| Artifact | Change |
|----------|--------|
| New SQL migration | Rewrite `fn_enqueue_order_status_notification` fixing all 3 column reference bugs |

