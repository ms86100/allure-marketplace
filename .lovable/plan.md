

# Round 3 Audit: Order Workflow + Cancellation + Live System

## Executive Summary

Found **3 Critical issues**, **2 High**, and **1 Medium**. The buyer cancellation system has multiple overlapping failures that compound into a complete dead-end.

---

## Critical Issue 1: `buyer_cancel_order` RPC HARDCODES allowed statuses

**Severity: Critical — This is THE primary blocker**

The live RPC definition (2-arg version) contains:
```sql
IF _current_status NOT IN ('placed', 'accepted') THEN
  RAISE EXCEPTION 'This order cannot be cancelled at this stage';
END IF;
```

Even though the UI correctly computes `canBuyerCancel` from DB transitions and renders the cancel button, the RPC **rejects any cancellation from statuses other than placed/accepted**. If an admin adds a `buyer → cancelled` transition from `preparing`, the UI shows the button but the backend rejects it.

There's a second 3-arg version of the RPC that's more permissive (no hardcoded status check), but the frontend calls the 2-arg signature, so it hits the restrictive one.

**Fix:** Replace the RPC with a DB-driven version that validates the transition against `category_status_transitions` instead of hardcoding.

---

## Critical Issue 2: Buyer Action Bar cancel button uses direct UPDATE — RLS blocks it

**Severity: Critical**

Line 505 in `OrderDetailPage.tsx`:
```tsx
onClick={() => o.updateOrderStatus('cancelled' as OrderStatus)}
```

`updateOrderStatus` does `supabase.from('orders').update(...)` — a direct table update. But the RLS policy on `orders` for UPDATE is:
```
Sellers and admins can update orders
```

**Buyers are not allowed to update orders directly.** This means even if the Buyer Action Bar rendered, the cancel would fail silently (0 rows returned, shown as "Order status has changed").

**Fix:** The Buyer Action Bar cancel must use the `buyer_cancel_order` RPC (same as `OrderCancellation` component does).

---

## Critical Issue 3: Buyer Action Bar NEVER renders for cancel-only states

**Severity: Critical**

Line 501:
```tsx
{o.isBuyerView && !isTerminalStatus(o.flow, order.status) && o.buyerNextStatus && (
```

The condition requires `buyerNextStatus` to be non-null. But `getNextStatusForActor` (line 130) **explicitly filters out `cancelled`**:
```ts
.filter(s => s !== 'cancelled') // Don't offer cancel as "next action"
```

For `placed` status in `cart_purchase`, the only buyer transition is `placed → cancelled`. After filtering, `buyerNextStatus` = null. So the Buyer Action Bar never renders.

The only working cancel path is the `OrderCancellation` component (line 268), which correctly uses `canBuyerCancel` and the RPC.

**Impact:** This isn't a blocker IF the OrderCancellation component works (which it does for placed/accepted thanks to the RPC hardcode). But it means the Buyer Action Bar's cancel button is unreachable dead code.

**Fix:** The Buyer Action Bar should render when `canBuyerCancel` is true even if `buyerNextStatus` is null. Decouple the cancel visibility from the forward-action bar.

---

## High Issue 4: `OrderCancellation` legacy fallback still hardcodes

**Severity: High**

Line 56:
```ts
const isEligible = canCancel !== undefined ? canCancel : ['placed', 'accepted'].includes(orderStatus);
```

When `canCancel` is passed (which it is from OrderDetailPage), this is fine. But the fallback is hardcoded. Since `canCancel` is always passed now, this is low risk but violates the "no hardcoding" principle.

**Fix:** Remove the legacy fallback entirely — require `canCancel` prop.

---

## High Issue 5: Dead-end state detection — `placed` has no forward buyer action

**Severity: High (UX gap, not a crash)**

For `cart_purchase` at `placed` status, the buyer's only transition is `placed → cancelled`. There is no forward action. The Buyer Action Bar doesn't render (Issue 3), and the only visible action is the `OrderCancellation` dialog button. This is correct behavior (buyer waits for seller to accept), but the UX shows no indication of what the buyer should do — no "Waiting for seller" state indicator beyond the hint text.

**No code fix needed** — this is a workflow design observation, not a bug.

---

## Medium Issue 6: Tests hardcode cancellation eligibility

**Severity: Medium**

`src/test/orders-payments.test.ts` lines 362-380 test cancellation with hardcoded `['placed', 'accepted'].includes(status)`. These tests will pass but don't validate the DB-driven logic.

**Fix:** Update tests to validate against `canActorCancel()` with mocked transitions.

---

## Fix Plan (4 changes)

### Fix 1: Replace `buyer_cancel_order` RPC with DB-driven version (Critical)
Drop the hardcoded status check. Instead, validate the transition against `category_status_transitions`:

```sql
-- Check if buyer→cancelled transition exists for current status
IF NOT EXISTS (
  SELECT 1 FROM category_status_transitions
  WHERE from_status = _current_status
    AND to_status = 'cancelled'
    AND allowed_actor = 'buyer'
) THEN
  RAISE EXCEPTION 'Invalid status transition';
END IF;
```

This makes the RPC respect whatever the admin configures.

### Fix 2: Buyer Action Bar — decouple cancel from forward action (Critical)
Change the render condition at line 501 to also show when `canBuyerCancel` is true (even without a forward action). Use the RPC for the cancel button instead of `updateOrderStatus`.

### Fix 3: Remove legacy hardcoded fallback in OrderCancellation (High)
Remove the `['placed', 'accepted'].includes(orderStatus)` fallback. Make `canCancel` a required prop.

### Fix 4: Drop the conflicting 2-arg RPC overload (Critical)
Two overloads exist with different behavior. The 2-arg one (hardcoded) shadows the 3-arg one. Drop the 2-arg version so only the DB-driven version remains.

### Files to Modify
1. **Database migration** — Replace `buyer_cancel_order` RPC with DB-driven transition validation
2. `src/pages/OrderDetailPage.tsx` — Fix Buyer Action Bar render condition + use RPC for cancel
3. `src/components/order/OrderCancellation.tsx` — Remove legacy hardcoded fallback

