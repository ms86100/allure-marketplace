

# Workflow Engine Audit — OTP + Delivery + Action Flow

## Issue 1: `verify_delivery_otp_and_complete` RPC Checks "Any Future Step" Instead of "Immediate Next Step"

**Severity: P0**

**Evidence** — `20260324160153` migration, lines 113-122:
```sql
SELECT EXISTS (
  SELECT 1 FROM public.category_status_flows csf
  WHERE csf.sort_order > _current_sort_order
    AND csf.otp_type = 'delivery'
  ORDER BY csf.sort_order ASC
  LIMIT 1
) INTO _next_step_requires_delivery_otp;
```

The `EXISTS` subquery checks if ANY future step (not just the immediate next) has `otp_type = 'delivery'`. The `ORDER BY` and `LIMIT 1` inside `EXISTS` are meaningless — `EXISTS` returns true/false, the ordering doesn't filter.

**Reproduction**: Workflow `default/seller_delivery` has delivery OTP on `delivered` (sort 70). If seller is at `accepted` (sort 20), the RPC checks "does any step after sort 20 have delivery OTP?" — yes, `delivered` does. So the RPC **accepts the OTP and advances from `accepted` to `preparing`** — even though `preparing` doesn't require OTP at all.

**Consequence**: A seller can call `verify_delivery_otp_and_complete` at ANY step before the OTP step and it will succeed, advancing one step forward. The OTP verification becomes a universal "advance one step" button that happens to also check a delivery code, regardless of whether OTP is actually required at that point. The `enforce_otp_gate` trigger won't fire because `app.otp_verified` is set to `true`.

**What it should be**: Check if the IMMEDIATE next step (sort_order just above current) has `otp_type = 'delivery'`.

---

## Issue 2: `enforce_otp_gate` Trigger Checks TARGET Status, Not Transition

**Severity: P1**

**Evidence** — `20260324143906` migration, lines 188-194:
```sql
SELECT csf.otp_type INTO v_otp_type
FROM public.category_status_flows csf
WHERE csf.status_key = NEW.status::text   -- checks the TARGET step
```

The trigger checks if the **target status** has `otp_type` set. But the UI checks `getStepOtpType(flow, nextStatus)` — the **next** status from current. These are the same thing, so they align.

However, there's a subtlety: the delivery OTP enforcement has a graceful bypass (line 223-224):
```sql
-- No delivery assignment = no enforcement (graceful)
RETURN NEW;
```

If no delivery assignment exists, the trigger allows the transition without OTP. This means on workflows where `creates_tracking_assignment` is configured on a later step, but `otp_type = 'delivery'` is on an earlier step, the OTP is silently bypassed.

**Reproduction**: Set `otp_type = 'delivery'` on `preparing` (sort 30) but `creates_tracking_assignment` on `picked_up` (sort 50). At `accepted → preparing`, there's no delivery assignment yet → trigger passes without OTP → step is advanced without any verification.

**Consequence**: Admin configures delivery OTP thinking it will be enforced, but it's silently skipped. No error, no warning at runtime.

---

## Issue 3: `food_beverages/seller_delivery` Workflow Has Incorrect Configuration (Active in Production)

**Severity: P0**

**Evidence** — DB query results:
```
food_beverages/seller_delivery:
  sort 20: accepted  → creates_tracking_assignment=true, is_transit=true, otp_type=null
  sort 30: preparing → otp_type='delivery'
  sort 70: delivered → otp_type=null  (should have delivery OTP)
```

- `accepted` creates tracking + is marked transit — delivery assignment is created when order moves to `accepted`
- `preparing` has `otp_type = 'delivery'` — seller needs OTP just to mark as "preparing"
- `delivered` (terminal) has NO OTP — anyone can complete delivery without verification

**Consequence**: This is the exact configuration causing the "Verify & Preparing" issue. And the terminal `delivered` step has no OTP gate, so the final delivery can happen without any verification — defeating the purpose of delivery OTP entirely.

---

## Issue 4: `is_success = true` on ALL Non-Terminal Steps

**Severity: P2**

**Evidence** — DB query shows every step in `food_beverages/seller_delivery` has `is_success = true`, including `placed`, `accepted`, `preparing`, etc.

The `is_success` flag is meant to mark terminal completion states, but it's set on every single step. This doesn't currently break logic because the code always checks `is_terminal AND is_success` together, but it's semantically wrong and could cause issues if any code checks `is_success` alone.

---

## Issue 5: Race Condition — `orderFulfillmentType` Defaults Before Order Loads

**Severity: P1**

**Evidence** — `useOrderDetail.ts` line 58:
```ts
const orderFulfillmentType = (order as any)?.fulfillment_type || 'self_pickup';
```

Before order loads, `order` is `null`, so `fulfillmentType` becomes `'self_pickup'`. This passes to `useCategoryStatusFlow` → `resolveTransactionType` resolves to `self_fulfillment`. The wrong workflow loads first.

When order data arrives (e.g., `fulfillment_type: 'delivery'`, `delivery_handled_by: 'seller'`), it resolves to `seller_delivery` and the correct workflow loads. But there's a brief window where the wrong flow is active.

**Mitigation**: `storedTransactionType` from the order takes priority in `resolveTransactionType`, so once the order loads, the correct workflow is used. But on the initial render, if `order` is null AND `effectiveParentGroup` resolves to something (via cached state), the wrong flow could briefly render action buttons.

**Consequence**: Possible flash of wrong action buttons on first load. The `isFlowLoading` guard on the seller action bar (line 208) mitigates this partially, but `hasBuyerActionBar` (line 209) has no such guard.

---

## Issue 6: Multiple `creates_tracking_assignment` Steps Allowed

**Severity: P1**

**Evidence** — DB query shows `default/seller_delivery`:
```
sort 50: picked_up   → creates_tracking_assignment=true
sort 60: on_the_way  → creates_tracking_assignment=true
```

Two steps have `creates_tracking_assignment = true`. The trigger `trg_create_seller_delivery_assignment` (line 30) has an idempotency check:
```sql
IF EXISTS (SELECT 1 FROM delivery_assignments WHERE order_id = NEW.id) THEN RETURN NEW; END IF;
```

So only the first step actually creates the assignment. But the admin UI doesn't enforce single-assignment either — the "Start Delivery Here" toggle allows multiple steps to be enabled simultaneously.

**Consequence**: Misleading configuration — admin thinks both steps start delivery, but only the first one does. If admin later reorders steps, the wrong one might create the assignment.

---

## Issue 7: `validate_order_status_transition` Bypassed by `app.otp_verified`

**Severity: P1**

**Evidence** — Transition validator, line 166:
```sql
IF current_setting('app.otp_verified', true) = 'true' THEN
  RETURN NEW;
END IF;
```

When `verify_delivery_otp_and_complete` sets `app.otp_verified = true`, the transition validator is completely bypassed. Combined with Issue 1 (RPC accepts OTP at any step), this means:

1. Seller calls `verify_delivery_otp_and_complete` at `accepted`
2. RPC sets `app.otp_verified = true`
3. RPC advances to `preparing` (next sort_order step)
4. Transition validator is skipped entirely — no actor check, no transition table validation

The RPC does check authorization (seller or rider), but it does NOT validate whether the transition `accepted → preparing` is defined in `category_status_transitions`.

**Consequence**: OTP verification bypasses ALL transition rules. If the transitions table doesn't have `accepted → preparing` for actor `seller`, the RPC still succeeds.

---

## Issue 8: Delivery OTP Card Shown for ALL Non-Terminal Statuses

**Severity: P2**

**Evidence** — `OrderDetailPage.tsx` lines 530-536:
```tsx
{o.isBuyerView && isDeliveryOrder && buyerOtp && !isTerminalStatus(o.flow, order.status) && (
  <div>Your Delivery Code: {buyerOtp}</div>
)}
```

The OTP card is shown as soon as a delivery assignment exists (with a code), regardless of where delivery OTP is configured in the workflow. If the assignment is created at `accepted` (sort 20) but delivery OTP is only on `delivered` (sort 70), the buyer sees the OTP code from step 2, long before it's needed.

**Consequence**: Buyer sees the OTP for the entire order lifecycle. This is a security risk — more time for the code to be intercepted or shared prematurely. The warning text says "Only share when you've received your items" but the code is visible from the very start.

---

## Summary Table

| # | Issue | Severity | Type |
|---|---|---|---|
| 1 | RPC checks ANY future step for OTP, not immediate next | P0 | Step skip risk |
| 2 | OTP enforcement silently bypassed when no delivery assignment | P1 | Silent failure |
| 3 | food_beverages workflow has OTP on wrong step | P0 | Data corruption |
| 4 | is_success=true on all steps | P2 | Semantic error |
| 5 | Wrong workflow loads before order data arrives | P1 | Race condition |
| 6 | Multiple creates_tracking_assignment steps allowed | P1 | Config ambiguity |
| 7 | OTP verified flag bypasses transition validation entirely | P1 | Security bypass |
| 8 | Buyer OTP code visible from assignment creation, not OTP step | P2 | Premature exposure |

