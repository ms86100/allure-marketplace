

## QA Audit: 5 Critical Bugs in the Dynamic Workflow Migration

---

### Bug 1: Edge Function `manage-delivery` Missing `parent_group` Filter — Validates Against Wrong Transitions

**Issue**: `handleUpdateStatus` (line 223-227) queries `category_status_transitions` filtering by `transaction_type` and `allowed_actor` only — it does NOT filter by `parent_group`. The frontend (`fetchStatusTransitions`) filters by both `parent_group` AND `transaction_type`. If multiple parent groups define different transition sets for the same `transaction_type`, the edge function will allow transitions that the workflow doesn't permit.

Additionally, it does NOT validate `from_status` — it only checks if `to_status` exists anywhere for the delivery actor, regardless of current state. A delivery agent could jump from `assigned` directly to `at_gate`, skipping `picked_up`.

**Why critical**: A delivery agent can skip workflow steps. Buyer sees status jump from "Assigned" to "At Gate" with no OTP generated (OTP is generated only on `picked_up`). Buyer has no code to share → delivery cannot be completed → order stuck forever.

**Impact**: `manage-delivery` edge function, delivery tracking UI, OTP flow, order completion.

**Fix**:
1. Add `parent_group` to the query (derive it from the order's seller profile or store on orders table)
2. Add `from_status` filter: `.eq('from_status', assignment.current_status)` to enforce sequential transitions
3. Low risk — only tightens validation, no behavior change for correct usage

---

### Bug 2: `handleUpdateStatus` Only Syncs Order Status for `picked_up` — Other Delivery Statuses Never Reach the Order

**Issue**: Line 295: `await db.from('orders').update({ status: 'picked_up' })` — this hardcoded order sync ONLY happens for `picked_up`. When the delivery agent updates to `on_the_way` or `at_gate`, the `delivery_assignments.status` changes but `orders.status` stays at `picked_up`. The frontend's `isInTransit` checks `order.status` against the flow's `is_transit` flag, so the map/tracking UI works by accident (because `picked_up` is `is_transit: true`). But the timeline shows "Picked Up" forever — it never advances to "On The Way" or "At Gate".

**Why critical**: Buyer sees a frozen timeline that doesn't reflect actual delivery progress. The delivery status card (DeliveryStatusCard) reads from `delivery_assignments`, so it shows the correct status, but the main order timeline contradicts it. This erodes buyer trust.

**Impact**: Order timeline, status display, buyer/seller hints, notification triggers tied to order status.

**Fix**:
1. After updating `delivery_assignments`, also update `orders.status` to match (for all non-terminal delivery statuses)
2. Add: `await db.from('orders').update({ status }).eq('id', assignment.order_id)` after line 336
3. Risk: The `validate_order_status_transition` trigger will fire — must ensure the transition is valid in the DB. Verify that `picked_up → on_the_way` and `on_the_way → at_gate` (and similar) transitions exist for `allowed_actor: delivery` in `category_status_transitions`.

---

### Bug 3: OTP Triggered on Hardcoded `picked_up` — Not Workflow-Driven

**Issue**: In `handleUpdateStatus` (line 238-296), OTP generation, buyer notification, and gate entry creation are all hardcoded inside `if (status === 'picked_up')`. If an admin creates a workflow where OTP should be generated at a different step (e.g., `on_the_way` or `assigned`), or where `picked_up` doesn't exist, no OTP is ever generated.

The system has a `requires_otp` flag on `category_status_flows` but the edge function doesn't read it. The seller-side OTP check (`stepRequiresOtp` on line 602 of OrderDetailPage) correctly reads the DB flag, but the actual OTP **generation** in the edge function ignores it entirely.

**Why critical**: The workflow engine promises dynamic OTP configuration, but OTP generation is hardwired to a specific status. If a workflow omits `picked_up` or places OTP requirement on a different step, the delivery completion flow breaks entirely — no OTP exists to verify.

**Impact**: OTP generation, buyer notification, gate entry creation, delivery completion.

**Fix**:
1. Query the flow step for the incoming status: check if `requires_otp = true` in `category_status_flows` for this `transaction_type` and `status_key`
2. Move OTP generation logic to fire on any status where the *next* step has `requires_otp = true` (or on the step itself, depending on business logic)
3. Risk: Must ensure the `delivery_code` column is populated before the OTP-requiring step. The existing `ensure_delivery_code_on_insert` trigger only fires on INSERT, not UPDATE.

---

### Bug 4: `verify_delivery_otp_and_complete` Hardcodes Jump to `completed` — Skips `delivered` State

**Issue**: The RPC (line 174-181) updates the order directly to `completed`, bypassing the `delivered` status entirely. But the workflow defines `delivered` as a distinct step (with its own notifications, display label, buyer hint). The buyer never sees "Delivered" — it jumps from "At Gate" (or "Picked Up") straight to "Completed".

This also means any workflow where `delivered → completed` requires buyer confirmation (e.g., buyer must click "Confirm Received") is completely bypassed. The OTP verification atomically marks the order as `completed`, removing the buyer's agency.

**Why critical**: Breaks workflows that have a buyer-confirmation step between delivery and completion. The buyer's action bar never shows because the order is already terminal.

**Impact**: Order lifecycle, buyer confirmation flow, settlement triggers, notification templates for `delivered` status.

**Fix**:
1. The RPC should advance to `delivered` (not `completed`) when the workflow has a `delivered` step before `completed`
2. Query `category_status_flows` to find the correct target status: the next non-terminal step after OTP verification, or the terminal step if `delivered` IS terminal
3. Risk: Settlement triggers may be tied to `completed` specifically. Must verify that settlements don't fire prematurely on `delivered`. The buyer must then have a visible "Confirm Delivery" action to advance to `completed`.

---

### Bug 5: `isDeliveryOrder` Still Uses Hardcoded Fulfillment Types — Not Workflow-Driven

**Issue**: Line 83 of OrderDetailPage: `const isDeliveryOrder = ['delivery', 'seller_delivery'].includes(fulfillmentType)`. This gates ALL delivery UI: OTP card, delivery map, delivery partner card, GPS tracking, delivery feedback, ETA banner. If a workflow defines transit/delivery steps but uses a different `fulfillment_type` value (or a future workflow type), none of the delivery UI renders.

The system already has `is_transit` on the flow steps — but `isDeliveryOrder` doesn't use it. It's a hardcoded check that determines whether delivery-related components even mount.

**Why critical**: Any new fulfillment type or workflow that involves delivery but doesn't match the hardcoded list will have a completely broken delivery experience — no OTP card, no map, no rider info, no tracking. The buyer sees a bare order page with no delivery context.

**Impact**: All delivery UI components (map, OTP card, rider card, GPS tracker, ETA banner, delivery feedback, arrival overlay), delivery assignment hydration.

**Fix**:
1. Replace `isDeliveryOrder` with a flow-derived check: `const hasDeliverySteps = flow.some(s => s.is_transit === true)`
2. Use this to gate delivery UI instead of hardcoded fulfillment type check
3. Keep `fulfillmentType` only for the fulfillment method label display (cosmetic)
4. Risk: Low — this is strictly additive. Orders without `is_transit` steps will have `hasDeliverySteps = false`, preserving current behavior. Must ensure `is_transit` is correctly seeded for all delivery workflows.

---

### Impact Analysis: If All 5 Bugs Are Fixed

| Module | Impact |
|---|---|
| `manage-delivery` edge function | Bugs 1, 2, 3 — tighter validation + order sync + dynamic OTP |
| `verify_delivery_otp_and_complete` RPC | Bug 4 — target status becomes dynamic |
| `OrderDetailPage.tsx` | Bug 5 — delivery UI gating becomes flow-driven |
| Order timeline | Bug 2 — delivery statuses now reflected correctly |
| Settlement triggers | Bug 4 — must verify settlement fires on correct terminal status |
| `validate_order_status_transition` trigger | Bug 2 — delivery-actor transitions must be valid in DB |
| Notification templates | Bugs 2, 3, 4 — notifications for `on_the_way`, `at_gate`, `delivered` now fire correctly |
| `category_status_flows` data | Bugs 3, 5 — `is_transit` and `requires_otp` must be correctly seeded |

### Implementation Priority (production release order)

1. **Bug 2** (order status sync) — highest buyer-visible impact, surgical fix
2. **Bug 1** (from_status validation) — prevents state corruption
3. **Bug 4** (OTP → delivered vs completed) — enables buyer confirmation workflows
4. **Bug 5** (isDeliveryOrder) — future-proofs delivery UI
5. **Bug 3** (dynamic OTP generation) — enables workflow flexibility

