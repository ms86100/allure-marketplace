

# Workflow Engine Audit — Post-Fix Findings

## Issue 1: `default/cart_purchase` Has THREE Steps With `creates_tracking_assignment = true`

**Severity: P1**

**Evidence** — DB query results:
```
default/cart_purchase:
  sort 30: preparing    → creates_tracking_assignment=true
  sort 50: picked_up    → creates_tracking_assignment=true
  sort 60: on_the_way   → creates_tracking_assignment=true
```

The previous fix (migration `20260324161009`) only cleared the duplicate from `default/seller_delivery`. The `default/cart_purchase` workflow was untouched and still has three steps flagged. The DB trigger `trg_create_seller_delivery_assignment` has an idempotency guard (`IF EXISTS ... THEN RETURN NEW`), so only `preparing` (first by sort_order) actually creates the assignment. The other two are misleading.

**Reproduction**: Admin opens `default/cart_purchase` in workflow editor. Sees three steps marked "Start Delivery Here". Believes all three create assignments.

**Root Cause**: Fix migration only targeted `default/seller_delivery`.

**Consequence**: Admin confusion. If steps are reordered, the wrong step would create the assignment. Also violates the admin editor's own save-time validation (but only if admin edits and re-saves — existing DB data bypasses frontend validation).

---

## Issue 2: `default/self_fulfillment` Has `creates_tracking_assignment = true` on `accepted`

**Severity: P1**

**Evidence** — DB query:
```
default/self_fulfillment:
  sort 20: accepted → creates_tracking_assignment=true
```

Self-fulfillment is a buyer-pickup workflow. Creating a delivery assignment makes no sense — there's no delivery. The admin editor has a runtime guard (lines 208-217) that auto-clears transit/tracking flags on self-pickup workflows during save, but existing DB data predates this validation.

**Reproduction**: New order with `fulfillment_type = 'self_pickup'` hits `accepted` status. The trigger fires, creates a `delivery_assignment` row with the seller as "rider". This delivery assignment will never be used, never completed, and sits as orphaned data.

**Root Cause**: Flag was set before the admin validation was added, and no migration cleaned it.

**Consequence**: Orphaned `delivery_assignments` rows for self-pickup orders. Buyer might see delivery tracking UI elements (line 88-90 checks `hasDeliverySteps` via `is_transit` which is `false` here, so map won't show, but `deliveryAssignmentId` could still be set, causing the "Setting up live tracking..." loader to appear).

---

## Issue 3: `is_success = true` on ALL Non-Terminal Steps in `default` Workflows

**Severity: P2**

**Evidence** — DB query confirms every non-terminal step across `default/seller_delivery`, `default/cart_purchase`, `default/self_fulfillment`, `default/request_service`, `default/service_booking` has `is_success = true`.

The `food_beverages/seller_delivery` workflow was correctly fixed (non-terminal steps have `is_success = false`), but ALL `default` workflows still have this semantic error.

**Root Cause**: The fix migration only corrected `food_beverages`. Default workflows were not touched.

**Consequence**: Currently low impact because code checks `is_terminal AND is_success` together. But `isSuccessfulTerminal()` would return `true` for any step that's `is_terminal = true AND is_success = true` — which is correct. The risk is if any future code checks `is_success` alone (e.g., for analytics or conditional rendering), non-terminal steps would falsely report as "successful."

---

## Issue 4: `default/cart_purchase` Has `otp_type = 'delivery'` on Both `picked_up` AND `on_the_way`

**Severity: P1**

**Evidence** — DB query:
```
default/cart_purchase:
  sort 50: picked_up   → otp_type='delivery'
  sort 60: on_the_way  → otp_type='delivery'
```

Two consecutive steps require delivery OTP. The `verify_delivery_otp_and_complete` RPC checks only the IMMEDIATE next step. So at `ready` (sort 40), seller must enter OTP to advance to `picked_up` (correct). But then at `picked_up`, the next step `on_the_way` ALSO requires OTP. Seller must enter the SAME delivery code AGAIN.

**Reproduction**: Seller processes `default/cart_purchase` order. At `ready → picked_up`: OTP required. At `picked_up → on_the_way`: OTP required AGAIN with the same code.

**Root Cause**: Both steps were configured with delivery OTP, likely unintentionally.

**Consequence**: Seller enters the same OTP twice for consecutive steps. Technically works (same delivery code), but confusing and unnecessary UX friction.

---

## Issue 5: `delivered` Step in `default/cart_purchase` Has `actor = 'system'`

**Severity: P1**

**Evidence** — DB:
```
default/cart_purchase:
  sort 70: delivered → actor='system', is_terminal=true
```

The `getNextStatusForActor` function in `useCategoryStatusFlow.ts` (line 156) checks if the next step's actor matches the requesting actor. Since `delivered` has `actor = 'system'`, neither seller nor buyer can advance to it via the normal action bar. The transitions table shows `on_the_way → delivered` with `allowed_actor = 'seller'`, so the transitions-based path works. But the flow-based fallback would fail.

**Reproduction**: If transitions fail to load (network issue), the fallback linear flow logic skips `delivered` because `actor = 'system'` doesn't match `'seller'`. Seller sees "Awaiting next step" with no action button.

**Root Cause**: Actor mismatch between flow step definition and transition rules.

**Consequence**: With transitions loaded (normal case): works fine. Without transitions (edge case): seller gets stuck at `on_the_way` with no way to advance.

---

## Issue 6: `app.otp_verified` Flag Reset May Be Too Late on Error

**Severity: P2**

**Evidence** — Migration `20260324161009`, line 180 and 201:
```sql
PERFORM set_config('app.otp_verified', 'true', true);  -- line 180
-- ... UPDATE orders (may trigger enforce_otp_gate + validate_order_status_transition)
PERFORM set_config('app.otp_verified', 'false', true);  -- line 201
```

If the `UPDATE public.orders` on line 192-199 raises an exception (e.g., from another trigger), the `set_config('app.otp_verified', 'false', true)` on line 201 never executes. However, since `set_config` with `true` as the third parameter means "local to transaction," and the transaction rolls back on exception, the setting is discarded. So this is actually safe.

**However**: The transition validation on line 166-177 checks `category_status_transitions` BEFORE setting `otp_verified`. But the trigger `validate_order_status_transition` ALSO checks transitions — and it's bypassed by `otp_verified`. So the RPC does transition validation itself, then sets the bypass flag, then the trigger skips its own validation. This is redundant but not harmful. The real concern is: the RPC validates against ALL `parent_group IN (_parent_group, 'default')` transitions, while the trigger may use a different resolution path. If they disagree, the RPC allows it but the trigger (if it ran) would block it.

**Consequence**: No current breakage, but defense-in-depth is weakened. The RPC's own transition check is the sole gate.

---

## Issue 7: Buyer OTP Card Visibility Relies on `o.nextStatus` Fallback

**Severity: P2**

**Evidence** — `OrderDetailPage.tsx` lines 530-534:
```tsx
const nextStatus = o.buyerNextStatus || o.nextStatus;
```

If the buyer has no transition defined (`buyerNextStatus = null`) but the seller does (`nextStatus = 'delivered'`), the buyer OTP card checks the SELLER's next status. If the seller's next step has `otp_type = 'delivery'`, the buyer sees the OTP code — even though the buyer has no action to take.

This is actually the INTENDED behavior (buyer shows code, seller enters it). But it's implicit. If the seller's next step has generic OTP instead of delivery OTP, the buyer would NOT see any code card (correct). The concern is the fallback chain is not explicitly documented and could break if `nextStatus` changes meaning.

**Consequence**: Currently correct behavior, but fragile. If seller's next status logic changes, buyer OTP visibility silently changes too.

---

## Summary Table

| # | Issue | Severity | Type |
|---|---|---|---|
| 1 | `default/cart_purchase` has 3 steps with `creates_tracking_assignment` | P1 | Config error |
| 2 | `default/self_fulfillment` has tracking on `accepted` (nonsensical) | P1 | Config error |
| 3 | `is_success = true` on all non-terminal steps in default workflows | P2 | Semantic error |
| 4 | `default/cart_purchase` has delivery OTP on two consecutive steps | P1 | UX friction |
| 5 | `delivered` step has `actor = 'system'` but transitions allow `seller` | P1 | Fallback risk |
| 6 | Transition validation is duplicated between RPC and trigger | P2 | Redundancy |
| 7 | Buyer OTP card falls back to seller's next status | P2 | Fragile coupling |

