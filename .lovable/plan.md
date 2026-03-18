

# Round 5: Production Readiness Audit

## Summary of Current State

Rounds 1-4 resolved the major architectural issues: GPS filtering, OSRM road ETA, Live Activity dedup/lifecycle, deep link 404 fix, stale ETA suppression, null location staleness, status flow cache alignment, and cart race conditions. The system is architecturally sound. This round identifies the remaining hardcoded values and residual gaps.

---

## Finding 1: `ACTIVE_STATUSES` in liveActivitySync.ts is hardcoded (HIGH)

**File:** `src/services/liveActivitySync.ts` lines 11-14

The `syncActiveOrders` function uses a hardcoded list `['accepted', 'preparing', 'ready', 'picked_up', 'on_the_way', 'arrived', 'confirmed']` to query active orders. This must come from the DB-backed `statusFlowCache.getStartStatuses()` which already exists and returns the correct set from `category_status_flows`.

**Fix:** Replace the hardcoded array with the result of `getStartStatuses()` from `statusFlowCache.ts`. Since `syncActiveOrders` is async, call it at the top and convert the Set to an array for the `.in()` query.

---

## Finding 2: Orchestrator queries `cart_purchase` + `default` only (HIGH)

**File:** `src/hooks/useLiveActivityOrchestrator.ts` lines 36-43

`fetchFlowEntries()` queries `transaction_type = 'cart_purchase'` and `parent_group = 'default'`. Delivery orders use `seller_delivery` and `food_beverages`. This means the orchestrator's flow entries (used for `buildLiveActivityData`) may be incomplete for delivery orders, causing missing `display_label` and incorrect `progress_percent`.

**Fix:** Align with `statusFlowCache.ts` by querying `.in('transaction_type', ['cart_purchase', 'seller_delivery'])` and removing the `parent_group` filter (or including both `default` and `food_beverages`).

---

## Finding 3: `DeliveryStatusCard` has hardcoded emoji prefixes (MEDIUM)

**File:** `src/components/delivery/DeliveryStatusCard.tsx` lines 145-150

The `displayBuyerMsg` and `displaySellerMsg` computations use hardcoded emoji prefixes (`⏳`, `🚚`, `🏠`, `🎉`, `📦`, `❌`, `✅`) per status. These should come from the `delivery_status_labels` DB setting, which already supports per-status configuration.

**Fix:** Extend the `delivery_status_labels` JSON to include an `emoji` key per status. Parse it in the component and use it instead of the inline conditional chain. Fallback to current emojis if DB value is missing.

---

## Finding 4: `DEFAULT_PROXIMITY` fallback in LiveDeliveryTracker (LOW — acceptable)

**File:** `src/components/delivery/LiveDeliveryTracker.tsx` lines 40-47

These are defensive fallbacks only used when the DB `proximity_thresholds` setting is missing. The DB value is confirmed present and active (visible in network response). No action needed.

---

## Finding 5: `DEFAULT_LABELS` fallback in DeliveryStatusCard (LOW — acceptable)

**File:** `src/components/delivery/DeliveryStatusCard.tsx` lines 59-68

Same pattern — defensive fallbacks for when `delivery_status_labels` is unavailable. DB value is confirmed active. No action needed.

---

## Finding 6: Deep link `KNOWN_ROUTES` is hardcoded (LOW)

**File:** `src/hooks/useDeepLinks.ts` lines 9-12

The set of valid route segments is hardcoded. This is acceptable because these are frontend route definitions, not business logic. Adding a new route requires a code change anyway. No action needed.

---

## Finding 7: `AddressPicker` ref warning in console (LOW)

The console shows a warning: "Function components cannot be given refs." This is in `AddressPicker` rendered on CartPage. Not a crash, but should be wrapped with `React.forwardRef` for correctness.

**Fix:** Wrap `AddressPicker` component with `React.forwardRef`.

---

## Live Tracking & Live Activity Verification

All previously identified critical issues are confirmed resolved in code:

- **Map smoothness:** Kalman-lite filter + CSS transition interpolation + heading rotation (useDeliveryTracking + OrderDetailPage)
- **Proximity:** DB-backed thresholds with at_doorstep/arriving/nearby states (system_settings `proximity_thresholds`)
- **Dynamic Island 404:** Deep link interceptor with KNOWN_ROUTES fallback (useDeepLinks)
- **Activity lifecycle:** Terminal status ends activity, dedup on hydration, 1:1 order-to-activity mapping (LiveActivityManager)
- **Stale ETA:** Suppressed when `isLocationStale` or `lastLocationAt` is null (LiveDeliveryTracker `getSmartEta`)
- **Null location staleness:** Treated as stale when order is active (useDeliveryTracking interval check)
- **Status flow alignment:** `statusFlowCache` queries both `cart_purchase` and `seller_delivery`

---

## Implementation Plan

| Step | What | Severity | Files |
|------|------|----------|-------|
| 1 | Replace hardcoded `ACTIVE_STATUSES` with DB-backed `getStartStatuses()` | High | `liveActivitySync.ts` |
| 2 | Fix orchestrator flow query to include `seller_delivery` | High | `useLiveActivityOrchestrator.ts` |
| 3 | Move emoji prefixes in DeliveryStatusCard to DB-backed config | Medium | `DeliveryStatusCard.tsx`, DB migration |
| 4 | Fix AddressPicker forwardRef warning | Low | `AddressPicker.tsx` |

