

# Implementation Plan: 5 Production Blockers

## Current State Summary

After investigating the codebase, here is the exact status of each blocker:

### What's Already Fixed (from previous round)
- Bug 1 (comma-separated actors in fallback): **FIXED** in `useCategoryStatusFlow.ts` line 174
- Bug 3 (buyer OTP check): **FIXED** in `OrderDetailPage.tsx` lines 632-651
- Bug 4 (actor enforcement trigger): **PARTIALLY FIXED** — `buyer_advance_order` sets `app.acting_as`, but seller path does NOT

### What's Still Broken

---

## Blocker 1: Seller Updates Bypass Actor Enforcement

**Current state:** `useOrderDetail.ts` line 228 — seller does a direct `.update()` on the orders table. No `app.acting_as = 'seller'` is ever set. The trigger falls to the "any actor" path (line 207-225 of latest migration), allowing a seller to execute buyer-only transitions.

**Fix:**
1. Create a `seller_advance_order` RPC (SECURITY DEFINER) mirroring `buyer_advance_order`:
   - Validates `auth.uid()` matches the seller's `user_id`
   - Sets `PERFORM set_config('app.acting_as', 'seller', true)`
   - Validates transition exists for `allowed_actor = 'seller'`
   - Performs the update
2. Update `useOrderDetail.ts` `updateOrderStatus()` to call this RPC instead of direct `.update()`
3. Keep rejection (cancellation) as a separate path since it already validates via transition table

---

## Blocker 2: Delivery Dashboard Fully Hardcoded

**Current state:** `DeliveryPartnerDashboardPage.tsx` lines 350-393 — three hardcoded blocks:
- `assigned` → button "Mark Picked Up" (hardcoded `picked_up`)
- `picked_up` → buttons "At Gate" (hardcoded `at_gate`) + "Verify & Deliver"
- `at_gate` → button "Verify & Deliver"

Also line 87: hardcoded `['assigned', 'picked_up', 'at_gate']` for active tab filter.
Line 125: hardcoded `['picked_up', 'at_gate']` for transit detection.

**Fix:**
1. For each delivery, fetch the order's workflow flow via the order's `transaction_type` / `seller.primary_group`
2. Filter flow for `is_transit` steps to get the delivery lifecycle
3. Derive the next action button dynamically: find current step in transit flow, show button for next step
4. Keep OTP interception for steps with `requires_otp = true`
5. Replace hardcoded status arrays with dynamic sets derived from the flow

---

## Blocker 3: Delivery-to-Order Sync Trigger Uses Stale Flag

**Current state:** `sync_delivery_to_order_status` (migration `20260301054712`) sets `app.delivery_sync = 'true'`. But the latest `validate_order_status_transition` (migration `20260323150232`) does NOT check `app.delivery_sync` — it only checks `app.acting_as` and `app.otp_verified`. The sync trigger also hardcodes status mappings (`picked_up→picked_up`, `at_gate→on_the_way`, `delivered→delivered`) instead of reading from the workflow.

**Fix:**
1. Update `sync_delivery_to_order_status` to set `app.acting_as = 'delivery'` instead of `app.delivery_sync`
2. Replace hardcoded status mappings with a dynamic lookup from `category_status_flows` using `is_transit` steps
3. Or simpler: map delivery assignment status to the corresponding order status by querying the workflow for the order's transaction_type

---

## Blocker 4: DeliveryStatusCard OTP Hint Still Hardcoded

**Current state:** `DeliveryStatusCard.tsx` line 220 — `['picked_up', 'at_gate'].includes(assignment.status)` for showing the OTP hint card. The `flow` prop is available but not used for this check.

**Fix:**
1. Replace the hardcoded array with a dynamic check: derive OTP-relevant statuses from `flow` steps where `requires_otp = true` or the next step has `requires_otp = true`
2. Fallback to current hardcoded list when no flow is provided

---

## Blocker 5: statusFlowCache Hardcodes Transaction Types

**Current state:** `statusFlowCache.ts` line 64 — `.in('transaction_type', ['cart_purchase', 'seller_delivery', 'self_fulfillment', 'service_booking', 'request_service', 'contact_enquiry'])`. Any new transaction type (e.g., `rental`) will be excluded, breaking Live Activity terminal detection.

**Fix:**
1. Remove the `.in('transaction_type', [...])` filter entirely
2. The `Set` deduplication on `status_key` already handles duplicates across transaction types
3. This is a one-line change with zero regression risk

---

## Implementation Order (by risk)

1. **Blocker 5** (statusFlowCache) — 1-line change, zero risk
2. **Blocker 4** (OTP hint) — small UI change, low risk
3. **Blocker 1** (seller RPC) — new RPC + frontend update, medium risk
4. **Blocker 3** (sync trigger) — DB trigger update, medium risk (must align flags)
5. **Blocker 2** (delivery dashboard) — largest change, needs workflow data plumbing

## Files to Modify

| File | Change |
|------|--------|
| `src/services/statusFlowCache.ts` | Remove `.in()` filter |
| `src/components/delivery/DeliveryStatusCard.tsx` | Replace hardcoded OTP status array |
| `src/hooks/useOrderDetail.ts` | Call `seller_advance_order` RPC instead of direct update |
| `src/pages/DeliveryPartnerDashboardPage.tsx` | Fetch workflow, derive action buttons dynamically |
| New migration SQL | `seller_advance_order` RPC + updated sync trigger |

