

# Root Cause Analysis & Fix Plan

## What's Actually Broken (Deep Dive Results)

### Root Cause: Delivery Assignment Trigger is Broken

The deployed `trg_create_seller_delivery_assignment()` function in the database has been **overwritten by a later migration** with a **hardcoded status list**:

```sql
-- DEPLOYED (broken):
IF NEW.status::text NOT IN ('accepted', 'preparing', 'ready', 'on_the_way') THEN RETURN NEW;
```

The `picked_up` status (which has `creates_tracking_assignment: true` in the workflow config) is **NOT in this list**. So when the order transitions to `picked_up`, the trigger exits early and **never creates the delivery_assignment**.

The correct workflow-driven version (from migration `20260323162710`) uses:
```sql
SELECT EXISTS (
  SELECT 1 FROM category_status_flows
  WHERE status_key = NEW.status::text
    AND is_transit = true AND creates_tracking_assignment = true
    AND transaction_type = ...
) INTO _is_transit_step;
```

This cascading failure causes ALL downstream issues:
- **No delivery_assignment** → No `deliveryAssignmentId` in React
- **No `deliveryAssignmentId`** → OTP dialog never shows (seller side)
- **No `delivery_code`** → No OTP card for buyer
- **No `deliveryAssignmentId`** → GPS tracker has no assignment to write to → "Start Sharing Location" does nothing
- **No assignment** → `enforce_otp_gate` sees no `delivery_code`, silently allows status change without OTP
- **Map fallback** → Already showing correctly ("Live map unavailable") since Google Maps API key issue was handled, but with no GPS data flowing there's nothing to show

### Secondary Issue: Workflow Length

The workflow has: `placed → accepted → preparing → ready → picked_up → on_the_way → delivered → completed → payment_pending → cancelled`

After `delivered` (sort_order 70), there's `completed` (sort_order 80) with transition `delivered → completed` by actor `system`. This makes the progress bar show redundant steps. The `picked_up` step also has empty `display_label`, `color`, and `icon` fields.

---

## Fix Plan

### Fix 1: Restore Workflow-Driven Trigger (Migration)
Create a new SQL migration that replaces the broken hardcoded trigger with the correct workflow-driven version using `creates_tracking_assignment` from `category_status_flows`.

Also add an `EXCEPTION WHEN OTHERS` handler that logs to `pg_notify` instead of silently swallowing errors.

### Fix 2: Backfill Missing Delivery Assignment
Add a one-time backfill in the same migration: for any `seller_delivery` orders currently in transit/delivered status that lack a `delivery_assignments` row, create one.

### Fix 3: Fix `enforce_otp_gate` Silent Bypass
Currently when `otp_type = 'delivery'` and no delivery_assignment exists, the gate silently allows the status change. Fix: when `otp_type = 'delivery'` and no delivery code exists, fall back to checking `order_otp_codes` (generic OTP) instead of silently passing. This ensures OTP is always enforced for the `delivered` step.

### Fix 4: Frontend — Defensive OTP Fallback
In `OrderDetailPage.tsx`, the OTP logic for the seller action bar currently requires `deliveryAssignmentId` when `otp_type = 'delivery'`. Add a fallback: if `otp_type = 'delivery'` but no `deliveryAssignmentId` exists, use `GenericOtpDialog` instead. Same for the buyer OTP card: show `GenericOtpCard` when the next step has any `otp_type` but no delivery assignment.

### Fix 5: Clean Up Workflow Display
- Fill in the empty `picked_up` step fields (display_label, color, icon, buyer_hint) via migration
- Filter `completed` and `payment_pending` from the stepper when `delivered` is the last meaningful step for the user (already partially done but the `picked_up` empty label causes visual issues)

---

## Technical Details

| Change | File/Location |
|--------|--------------|
| New migration: restore trigger + backfill + fix OTP gate | `supabase/migrations/new_fix.sql` |
| New migration: fill picked_up step fields | Same migration |
| Frontend OTP fallback | `src/pages/OrderDetailPage.tsx` lines 1041-1063 (seller bar) and 748-776 (buyer OTP cards) |

### Migration SQL (key parts):

**Trigger fix:**
```sql
CREATE OR REPLACE FUNCTION public.trg_create_seller_delivery_assignment()
-- Uses creates_tracking_assignment flag from category_status_flows
-- instead of hardcoded status list
```

**OTP gate fix:**
```sql
-- When otp_type = 'delivery' but no delivery_assignment exists,
-- check order_otp_codes as fallback instead of silently passing
IF _otp_type = 'delivery' THEN
  IF NOT _has_delivery_code THEN
    -- Fallback: check generic OTP
    SELECT EXISTS (...order_otp_codes...) INTO _otp_verified;
    IF NOT _otp_verified THEN
      RAISE EXCEPTION 'OTP verification required';
    END IF;
  ELSE
    RAISE EXCEPTION 'Delivery OTP verification required';
  END IF;
END IF;
```

**Frontend OTP fix (pseudocode):**
```typescript
// Seller action bar: when otp_type is 'delivery' but no assignment
const needsDeliveryOtp = nextOtpType === 'delivery' && !!deliveryAssignmentId;
const needsGenericOtp = nextOtpType === 'generic';
// NEW: fallback to generic OTP when delivery OTP configured but no assignment
const needsFallbackOtp = nextOtpType === 'delivery' && !deliveryAssignmentId;
```

