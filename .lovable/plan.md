

# Workflow Engine Audit — Round 3 Findings

## Issue 1: `food_beverages/cart_purchase` Still Has `is_success = true` on ALL Non-Terminal Steps

**Severity: P2**

**Evidence** — DB query confirms:
```
food_beverages/cart_purchase:
  sort 10: placed     → is_success=true, is_terminal=false
  sort 20: accepted   → is_success=true, is_terminal=false
  sort 30: preparing  → is_success=true, is_terminal=false
  sort 40: ready      → is_success=true, is_terminal=false
  sort 50: picked_up  → is_success=true, is_terminal=false
  sort 60: on_the_way → is_success=true, is_terminal=false
```

Similarly `food_beverages/self_fulfillment` has `is_success=true` on all non-terminal steps (placed, accepted, preparing, ready, buyer_received).

The Round 2 data fix only corrected `food_beverages/seller_delivery`. The other two `food_beverages` workflows were missed.

**Reproduction**: Query `category_status_flows WHERE parent_group = 'food_beverages' AND is_terminal = false AND is_success = true`.

**Root Cause**: The previous fix targeted `food_beverages/seller_delivery` and all `default` workflows but overlooked `food_beverages/cart_purchase` and `food_beverages/self_fulfillment`.

**Consequence**: Same as prior audit — semantically incorrect, risks false positives if any code checks `is_success` without also checking `is_terminal`.

---

## Issue 2: `food_beverages/cart_purchase` Has Delivery OTP on `picked_up` AND `on_the_way` — Same Double-OTP Bug

**Severity: P1**

**Evidence** — DB query:
```
food_beverages/cart_purchase:
  sort 50: picked_up   → otp_type='delivery'
  sort 60: on_the_way  → otp_type='delivery'
  sort 70: delivered   → otp_type=null
```

This is the exact same pattern that was fixed for `default/cart_purchase` in Round 2 — two consecutive steps require delivery OTP, and the terminal `delivered` step has none.

**Reproduction**: A `food_beverages/cart_purchase` order reaching `ready → picked_up` triggers OTP. Then `picked_up → on_the_way` triggers OTP again with the same code. Then `on_the_way → delivered` has no OTP gate at all.

**Root Cause**: Round 2 only corrected `default/cart_purchase`. The `food_beverages` override was not touched.

**Consequence**: (a) Seller/delivery partner enters same OTP twice. (b) Final delivery step has no OTP verification — defeating the purpose of delivery OTP entirely.

---

## Issue 3: `food_beverages/cart_purchase` Has `delivered` with `actor = 'system'`

**Severity: P1**

**Evidence** — DB:
```
food_beverages/cart_purchase:
  sort 70: delivered → actor='system', is_terminal=true
```

Transitions for `food_beverages/cart_purchase` were NOT returned from the DB query — none exist. This means the workflow relies entirely on the `default/cart_purchase` transitions (which have `on_the_way → delivered` with `allowed_actor = 'seller'` and `'delivery'`).

But the flow step says `actor = 'system'`. The `getNextStatusForActor` function's linear fallback checks the step's `actor` field. If transitions fail to load, the seller/delivery partner cannot advance to `delivered` because the actor doesn't match.

**Reproduction**: Load an order with `parent_group = food_beverages`, `transaction_type = cart_purchase`. If no `food_beverages/cart_purchase` transitions exist in DB and the default transitions fail to load (network), the fallback linear flow logic cannot advance past `on_the_way`.

**Root Cause**: Same `actor = 'system'` issue identified in Round 2 for `default/cart_purchase` was fixed there, but `food_beverages` override was not corrected.

**Consequence**: Edge case: seller gets stuck with no action button if transitions fail to load.

---

## Issue 4: `food_beverages/seller_delivery` — `creates_tracking_assignment` and `otp_type='delivery'` on Same Step (`on_the_way`)

**Severity: P1**

**Evidence** — DB:
```
food_beverages/seller_delivery:
  sort 60: on_the_way → creates_tracking_assignment=true, otp_type='delivery'
  sort 70: delivered  → otp_type=null
```

When the order transitions to `on_the_way`, the trigger `trg_create_seller_delivery_assignment` fires and creates a delivery assignment. Simultaneously, the `enforce_otp_gate` trigger checks if `on_the_way` requires delivery OTP — it does. But the delivery assignment was JUST created in the same transaction by the `trg_create_seller_delivery_assignment` trigger.

The question is: does `enforce_otp_gate` see the delivery assignment created by the earlier trigger in the same transaction? In PostgreSQL, triggers on the same table fire in alphabetical order, and changes from one AFTER trigger are visible to the next. But `trg_create_seller_delivery_assignment` runs on the `orders` table as an AFTER UPDATE trigger, while `enforce_otp_gate` also runs on the `orders` table.

The bigger issue: the OTP is checked when transitioning TO `on_the_way`, but the delivery assignment (with its code) is only CREATED at that transition. The seller cannot have already verified the code because the code didn't exist before this step. The seller would need to call `verify_delivery_otp_and_complete` from `picked_up → on_the_way`, but the RPC checks if the NEXT step (`on_the_way`) requires delivery OTP. It does, so the RPC proceeds. But the RPC also looks for the delivery assignment — which doesn't exist yet (it's created when order reaches `on_the_way`).

**The actual flow**: Seller at `picked_up` → RPC checks next step `on_the_way` has `otp_type = 'delivery'` → RPC looks for delivery assignment → **NONE EXISTS** → `RAISE EXCEPTION 'Delivery assignment not found'`.

**Consequence**: The workflow is deadlocked. The seller CANNOT advance to `on_the_way` because OTP requires a delivery assignment that only gets created when you reach `on_the_way`. The `creates_tracking_assignment` flag must be on an EARLIER step than the first `otp_type = 'delivery'` step.

---

## Issue 5: `food_beverages/seller_delivery` — `accepted` is Marked `is_transit = true` But Has No Tracking Assignment

**Severity: P2**

**Evidence** — DB:
```
food_beverages/seller_delivery:
  sort 20: accepted → is_transit=true, creates_tracking_assignment=false
```

The `accepted` step is marked as transit, but no delivery assignment exists yet (tracking assignment is created at `on_the_way`, sort 60). This means:
- `isInTransit` returns `true` immediately after acceptance
- GPS tracking UI (`SellerGPSTracker`) activates at `accepted`
- Map/Live Activity components may attempt to render without a delivery assignment

**Reproduction**: Seller accepts an order. `isInTransit` becomes true. UI renders GPS broadcaster and map components. But `deliveryAssignmentId` is null — map shows "Setting up live tracking..." loader indefinitely until `on_the_way`.

**Root Cause**: `is_transit` was set on `accepted` (likely wanting to show "in progress" state) but tracking infrastructure requires a delivery assignment.

**Consequence**: GPS tracking UI components activate prematurely. The "Setting up live tracking..." loader shows from `accepted` through `preparing`, `ready`, `picked_up` — 4 steps before tracking actually starts. Confusing for both buyer and seller.

---

## Issue 6: `food_beverages/cart_purchase` Has No Transitions in DB — Relies Entirely on Default Fallback

**Severity: P2**

**Evidence** — The transitions query for `parent_group = 'food_beverages'` returned results only for `self_fulfillment` and `seller_delivery`. There are ZERO transitions for `food_beverages/cart_purchase`.

The `useCategoryStatusFlow` hook's flow fetch falls back to `default` if no parent_group-specific data exists, but `useStatusTransitions` uses the same pattern — fetching for `food_beverages` first, then `default`. Since flow steps DO exist for `food_beverages/cart_purchase` (they were returned), the system uses the `food_beverages` flow. But transitions come from `default`.

The `getNextStatusForActor` function receives `food_beverages` flow steps but `default` transitions. The transitions reference statuses from `default/cart_purchase` which happen to match (same status_key names), so it works. But if the `food_beverages` flow has steps that `default` doesn't (or vice versa), transitions would break silently.

**Consequence**: Currently works by coincidence (same status keys in both). But admin could edit `food_beverages/cart_purchase` to add custom steps without creating matching transitions, causing the action bar to show "Awaiting next step" with no button.

---

## Issue 7: Delivery Assignment `status` Not Updated During Non-Terminal OTP Steps

**Severity: P1**

**Evidence** — RPC migration, lines 183-189:
```sql
UPDATE public.delivery_assignments
SET
  status = CASE WHEN _next_step_is_terminal THEN 'delivered' ELSE _assignment_record.status END,
  delivered_at = CASE WHEN _next_step_is_terminal THEN now() ELSE _assignment_record.delivered_at END,
```

When OTP verifies a non-terminal step (e.g., `picked_up → on_the_way`), the delivery assignment status stays unchanged (whatever it was when created — likely `'assigned'` or `'pending'`). The `DeliveryStatusCard` and `LiveDeliveryTracker` components use the assignment's status to show progress.

Meanwhile, the ORDER status advances to `on_the_way`, but the delivery ASSIGNMENT status remains stale. The `DeliveryStatusCard` derives its progress bar from `assignment.status`, not `order.status`.

**Reproduction**: Order at `picked_up`, OTP verified, order advances to `on_the_way`. Delivery assignment status still shows `'assigned'`. The delivery status card shows the rider as "assigned" while the order shows "On the Way".

**Root Cause**: The RPC only updates delivery assignment status to `'delivered'` on terminal steps, leaving it unchanged for intermediate OTP steps.

**Consequence**: Delivery tracking UI shows stale/incorrect status. Progress bar in `DeliveryStatusCard` doesn't advance. Buyer sees conflicting information between order status and delivery status.

---

## Summary Table

| # | Issue | Severity | Type |
|---|---|---|---|
| 1 | `food_beverages/cart_purchase` + `self_fulfillment` still have `is_success=true` on non-terminal | P2 | Missed fix |
| 2 | `food_beverages/cart_purchase` has double delivery OTP + no OTP on terminal | P1 | Config error |
| 3 | `food_beverages/cart_purchase` `delivered` has `actor='system'` | P1 | Fallback risk |
| 4 | `food_beverages/seller_delivery` has tracking AND OTP on same step — deadlock | P1 | Workflow deadlock |
| 5 | `food_beverages/seller_delivery` `accepted` marked transit without tracking | P2 | Premature UI |
| 6 | `food_beverages/cart_purchase` has no transitions — relies on default fallback | P2 | Fragile coupling |
| 7 | Delivery assignment status not synced during non-terminal OTP steps | P1 | State desync |

