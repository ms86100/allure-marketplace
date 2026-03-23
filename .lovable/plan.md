

# Full Audit: Hardcoded Values Overriding Workflow Configuration

## Summary

The system has **two parallel truth sources** for transit/OTP/actor behavior: the workflow engine (`category_status_flows.is_transit`, `requires_otp`) and `system_settings.transit_statuses`. While `useOrderDetail.isInTransit` correctly reads the workflow's `is_transit` flag, at least **7 other consumers** still use the `system_settings` flat list or hardcoded arrays, causing the disconnect you observe.

Additionally, the specific order `b3046e61...` has `transaction_type: null`, which means the workflow resolver falls back to runtime logic instead of using the persisted workflow key.

---

## Finding 1: `transaction_type` is NULL on the order

The `create_multi_vendor_orders` RPC was updated to set `transaction_type` at creation, but orders created before that migration have `null`. The `resolveTransactionType` fallback works (`delivery` + `delivery_handled_by=seller` → `seller_delivery`), but this adds fragility. All existing `null` orders should be backfilled.

**Fix:** Migration to backfill `transaction_type` on all orders where it's null, using the same resolution logic.

---

## Finding 2: `LiveDeliveryTracker` uses `system_settings`, not workflow

`src/components/delivery/LiveDeliveryTracker.tsx` line 140:
```ts
const transitSet = new Set(trackingConfig.transit_statuses);
const isInTransit = transitSet.has(tracking.status);
```
This re-gates ETA display and proximity messages behind `system_settings.transit_statuses` even though the parent (`OrderDetailPage`) already determined `isInTransit` from the workflow. If `preparing` is marked `is_transit` in the workflow but is not in `system_settings.transit_statuses`, the map card renders but ETA and proximity text disappear.

**Fix:** Pass `isInTransit` as a prop from `OrderDetailPage` (which already derives it from workflow). Remove the internal `trackingConfig.transit_statuses` check.

---

## Finding 3: `useDeliveryTracking` poll rate uses `system_settings`

`src/hooks/useDeliveryTracking.ts` line 200:
```ts
const transitStatuses = new Set(getTrackingConfigSync().transit_statuses);
if (!transitStatuses.has(currentStatusRef.current)) return POLL_IDLE_MS;
```
GPS polling rate falls back to idle (15s) for any status not in `system_settings.transit_statuses`, even if the workflow says it's transit. This means `preparing` with `is_transit=true` would poll slowly.

**Fix:** Accept the workflow flow steps as a parameter and check `is_transit` directly instead of relying on system_settings.

---

## Finding 4: `enforce_delivery_otp_gate` trigger ignores workflow `requires_otp`

`supabase/migrations/20260318132639` — the trigger unconditionally requires OTP verification when a `delivery_code` exists on the assignment, regardless of whether the workflow's `delivered` step has `requires_otp = false`.

**Fix:** Update trigger to lookup `category_status_flows` for the `delivered` step's `requires_otp` flag. Only enforce OTP when `requires_otp = true` (or default to true if no workflow step found).

---

## Finding 5: Edge function `update-delivery-location` has 5+ hardcoded transit arrays

Lines 330, 401, 449, 451, 549 all contain `['picked_up', 'on_the_way', 'at_gate']`. While line 549 loads `transit_statuses_la` from system_settings with a hardcoded fallback, lines 330/401/449/451 are fully hardcoded.

**Fix:** All transit checks in this edge function should load `transit_statuses` from system_settings at the top of the function (already done for LA) and use that single variable throughout.

---

## Finding 6: `DeliveryStatusCard` has `HARDCODED_DELIVERY_STEPS`

`src/components/delivery/DeliveryStatusCard.tsx` line 75:
```ts
const HARDCODED_DELIVERY_STEPS = ['pending', 'assigned', 'picked_up', 'on_the_way', 'at_gate', 'delivered'];
```
Used as fallback when no workflow flow is available. This is acceptable as a fallback, but the `FALLBACK_OTP_STATUSES` on line 229 also hardcodes which statuses trigger OTP.

**Fix:** Ensure the workflow flow is always passed and loaded; the fallback is acceptable but should log a warning.

---

## Finding 7: `liveActivityMapper` uses `system_settings.transit_statuses_la`

`src/services/liveActivityMapper.ts` lines 45, 111 use `getTrackingConfigSync().transit_statuses_la`. This is acceptable IF the admin save auto-sync (Bug 2 fix) actually keeps `system_settings` in sync. However, the auto-sync collects ALL `is_transit` steps across ALL workflows into one flat list, which is semantically imprecise (different workflows may have different transit steps).

**Impact:** Low — the flat list approach is a reasonable approximation for system-wide settings consumed by edge functions and native code.

---

## Finding 8: `monitor-stalled-deliveries` edge function uses `system_settings`

This is expected and correct — edge functions don't have per-order workflow context.

---

## Implementation Plan

### Phase 1 — Database (3 changes)

1. **Backfill `transaction_type`** on all orders where it's null, using the same resolution logic from `validate_order_status_transition`.

2. **Update `enforce_delivery_otp_gate`** to check workflow `requires_otp` flag before enforcing OTP.

3. **Update `update-delivery-location` edge function** to load `transit_statuses` from system_settings once and use it everywhere (replace 5 hardcoded arrays).

### Phase 2 — Frontend (3 changes)

4. **`LiveDeliveryTracker`**: Accept `isInTransit` prop from parent instead of re-deriving from `system_settings`.

5. **`useDeliveryTracking`**: Accept workflow flow or `isInTransit` flag to control poll rate instead of `system_settings`.

6. **`DeliveryArrivalOverlay`** (if it exists as separate component): Same pattern — accept transit state from parent.

### Files to Modify

| File | Change |
|------|--------|
| New migration SQL | Backfill `transaction_type`, update `enforce_delivery_otp_gate` |
| `supabase/functions/update-delivery-location/index.ts` | Replace hardcoded transit arrays with system_settings lookup |
| `src/components/delivery/LiveDeliveryTracker.tsx` | Accept `isInTransit` prop |
| `src/hooks/useDeliveryTracking.ts` | Accept workflow-derived transit flag |
| `src/pages/OrderDetailPage.tsx` | Pass `isInTransit` to `LiveDeliveryTracker` |

### Risk Assessment

- **Backfill migration**: Low risk — one-time UPDATE with safe CASE logic
- **OTP gate trigger**: Medium risk — must default to requiring OTP when no workflow found
- **Edge function**: Medium risk — behavioral change in production delivery tracking
- **Frontend props**: Low risk — cosmetic wiring, no logic change

