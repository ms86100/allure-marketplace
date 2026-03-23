

# QA Audit Round 2: 5 Critical Bugs

## Impact Preface

Fixes touch: Delivery Partner Dashboard, tracking/GPS subsystem, sync trigger, `verify_delivery_otp_and_complete` RPC, and `useTrackingConfig`. Regression testing needed across all delivery workflows.

---

## Bug 1: Delivery Dashboard Passes `undefined` Flow — Falls Back to Hardcoded Logic

**Issue:** `DeliveryPartnerDashboardPage.tsx` line 425 calls `getNextDeliveryAction(undefined /* TODO: pass per-order flow */, delivery.status)`. The `useDeliveryWorkflow` hook exists (lines 22-53) but is never called per delivery. Every action button falls through to the hardcoded fallback (`assigned→picked_up`, `picked_up→at_gate`, `at_gate→delivered`).

**Why critical:** Any admin-configured workflow variation (skip `at_gate`, add `on_the_way`, custom OTP steps) is completely ignored. Delivery partners see wrong buttons and advance to wrong states.

**Root cause:** The workflow hook is defined but never wired to the rendering loop. The `TODO` comment on line 425 confirms this was known but unfinished.

**Impact:** Delivery partner actions, delivery-to-order sync (wrong statuses synced), buyer timeline.

**Risk of fix:** Medium — need to call `useDeliveryWorkflow` per unique order ID across deliveries. Can batch by fetching once per order and memoizing. The query already has `staleTime: 5min`.

**Fix plan:**
1. For each active delivery, resolve the order's workflow via `useDeliveryWorkflow(delivery.order?.id)`.
2. Since hooks can't be called in loops, create a `DeliveryActionCard` component that encapsulates a single delivery card + its workflow hook.
3. Pass the resolved `flow` to `getNextDeliveryAction(flow, delivery.status)` instead of `undefined`.

---

## Bug 2: `transit_statuses` in Tracking Config Is a Separate Hardcoded System Setting — Not Workflow-Driven

**Issue:** `useTrackingConfig` defaults to `transit_statuses: ['picked_up', 'on_the_way', 'at_gate']` (line 24). This drives: GPS polling rate (`useDeliveryTracking` line 200), arrival overlay visibility (`OrderDetailPage` line 188), Live Activity `isTransit` check (`liveActivityMapper` line 112), and stalled delivery monitoring (edge function). These are system_settings values, completely disconnected from the workflow's `is_transit` flag.

**Why critical:** If an admin adds a custom transit step (e.g., `en_route_to_society`) in the workflow, that step won't appear in `transit_statuses`. GPS tracking won't activate, the map won't show, Live Activity won't update, and the buyer sees "Setting up live tracking..." forever.

**Root cause:** Two parallel truth sources — `category_status_flows.is_transit` (workflow) and `system_settings.transit_statuses` (tracking). They are never synchronized.

**Impact:** GPS tracking, Live Activity, delivery map, arrival overlay, stalled delivery monitoring.

**Risk of fix:** Medium — the `system_settings` approach is used by edge functions that don't have access to per-order workflow context. A full fix requires either: (a) auto-syncing `system_settings.transit_statuses` when workflow is saved in admin, or (b) making edge functions resolve transit from the workflow. Option (a) is safer and surgical.

**Fix plan:**
1. In `AdminWorkflowManager.tsx` save handler, after saving workflow steps, compute all unique `status_key` values where `is_transit = true` across all workflows.
2. Upsert `system_settings` key `transit_statuses` with this array.
3. Also update `transit_statuses_la` similarly.
4. This ensures the tracking subsystem stays in sync with admin workflow changes.

---

## Bug 3: `verify_delivery_otp_and_complete` Uses `transaction_type` Column — But Ignores `parent_group`

**Issue:** The RPC on line 69 queries `category_status_flows WHERE transaction_type = COALESCE(_order_record.transaction_type, 'self_fulfillment')` but does NOT filter by `parent_group`. If two parent groups define the same `transaction_type` with different transit step configurations (e.g., `food_beverages/seller_delivery` has `is_transit=true` on `picked_up` but `default/seller_delivery` does not), the query may match the wrong row, either allowing OTP verification when it shouldn't or blocking it when it should.

**Why critical:** A seller in a custom category tries to verify OTP delivery but gets "Order is not ready for delivery confirmation" because the wrong workflow row was matched.

**Root cause:** Missing `parent_group` filter in the RPC's `category_status_flows` lookup.

**Impact:** OTP delivery completion for all non-default parent groups.

**Risk of fix:** Low — add `AND parent_group = COALESCE(v_parent_group, 'default')` to both flow lookups in the RPC (lines 68-72 and 107-113). Same pattern already used in `validate_order_status_transition`.

**Fix plan:**
1. Resolve `_parent_group` from `seller_profiles.primary_group` (already fetched as `_seller_user_id` context).
2. Add `AND csf.parent_group = COALESCE(_parent_group, 'default')` to both `category_status_flows` queries.
3. Add fallback to `'default'` parent_group if no match found (mirrors the cascade pattern).

---

## Bug 4: `sync_delivery_to_order_status` Trigger — `at_gate` Hardcoded Fallback Mapping

**Issue:** The sync trigger (latest migration, line 213-221) has a hardcoded fallback: `IF v_target_order_status IS NULL AND NEW.status = 'at_gate' THEN ... status_key = 'on_the_way'`. This maps `at_gate` delivery assignment status to `on_the_way` order status when no direct match exists. This is a residual hardcoded mapping that contradicts the "everything must be workflow-driven" principle.

**Why critical:** If a workflow defines `at_gate` as an order-level status (not just delivery-level), this fallback incorrectly maps it to `on_the_way` instead. The buyer sees "On The Way" when the rider is actually at their gate. Conversely, if a workflow doesn't have `on_the_way` at all, the sync fails silently.

**Root cause:** Leftover hardcoded mapping from pre-workflow era.

**Impact:** Delivery-to-order status sync, buyer timeline accuracy.

**Risk of fix:** Low — remove the hardcoded `at_gate → on_the_way` mapping. If no direct match exists in the workflow, the sync should simply not advance the order (the order stays at its current status until the next matching transit event). This is the correct behavior for workflow-driven execution.

**Fix plan:**
1. Remove the `IF v_target_order_status IS NULL AND NEW.status = 'at_gate'` block entirely.
2. If no workflow match is found, return without updating the order. The OTP completion RPC handles the final jump.

---

## Bug 5: Delivery Dashboard In-Transit Detection Still Hardcoded

**Issue:** `DeliveryPartnerDashboardPage.tsx` line 199 uses `!['pending', 'assigned', 'delivered', 'failed', 'cancelled'].includes(d.status)` to detect in-transit deliveries for auto-starting GPS tracking. This is a hardcoded exclusion list. If a workflow adds a non-transit step between `assigned` and first transit (e.g., `preparing_package`), GPS tracking would start prematurely. Conversely, the active tab filter (line 161) uses `query.not('status', 'in', '(delivered,failed,cancelled)')` which is correct but doesn't use the workflow's terminal flags.

**Why critical:** GPS tracking starts at wrong time — battery drain for the delivery partner, and potentially incorrect location being broadcast to the buyer before the rider has actually started transit.

**Root cause:** In-transit detection not derived from workflow `is_transit` flag.

**Impact:** GPS tracking activation, battery usage, buyer-facing rider location.

**Risk of fix:** Low-Medium — requires each delivery card to know its workflow (ties into Bug 1 fix). Once per-delivery workflow is available, derive transit statuses from `is_transit` steps.

**Fix plan:**
1. As part of the Bug 1 fix (component extraction), pass the resolved workflow flow to the transit detection logic.
2. Replace the hardcoded exclusion list with: `flow.some(s => s.status_key === d.status && s.is_transit)`.
3. Fallback to current hardcoded list when no flow is loaded.

---

## Implementation Order

1. **Bug 4** (remove hardcoded `at_gate` mapping in sync trigger) — DB migration, zero frontend risk
2. **Bug 3** (`parent_group` filter in OTP RPC) — DB migration, zero frontend risk
3. **Bug 1 + Bug 5** (extract `DeliveryActionCard` component, wire workflow) — largest change, resolves both dashboard issues
4. **Bug 2** (auto-sync `transit_statuses` on workflow save) — admin UI change + system_settings upsert

## Files to Modify

| File | Change |
|------|--------|
| New migration SQL | Fix OTP RPC `parent_group` filter, remove `at_gate` mapping in sync trigger |
| `src/pages/DeliveryPartnerDashboardPage.tsx` | Extract `DeliveryActionCard`, wire `useDeliveryWorkflow`, fix transit detection |
| `src/components/admin/AdminWorkflowManager.tsx` | Auto-sync `transit_statuses` system setting on save |

