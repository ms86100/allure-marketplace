

# Round 6: Production Readiness Audit

## Current State Summary

Rounds 1-5 addressed the major architectural issues. The system now has DB-backed status flows, GPS filtering, OSRM road ETA, Live Activity dedup/lifecycle, deep link 404 fix, stale ETA suppression, cart race conditions, and DB-backed emoji configuration. This round identifies the remaining gaps.

---

## Finding 1: APNs edge function has hardcoded TERMINAL_STATUSES (HIGH)

**File:** `supabase/functions/update-live-activity-apns/index.ts` line 31-33

The edge function uses a hardcoded `TERMINAL_STATUSES` set: `delivered, completed, cancelled, no_show, failed`. Unlike the client-side `LiveActivityManager` (which loads from DB via `getTerminalStatuses()`), the server-side APNs function does not query `category_status_flows.is_terminal`. If a new terminal status is added to the DB, the edge function will not recognize it and will send `update` instead of `end`, causing the Live Activity to persist after delivery.

**Fix:** Query `category_status_flows` for `is_terminal = true` at the start of the function invocation. Union with the safety-net defaults. Use that set for the `isTerminal` check.

---

## Finding 2: APNs edge function uses `parent_group` filter, client does not (HIGH)

**File:** `supabase/functions/update-live-activity-apns/index.ts` lines 92-98

`getStatusFlowData()` queries with `.eq("parent_group", parentGroup)` defaulting to `"default"`. The client-side `liveActivitySync.ts` and `statusFlowCache.ts` use `.in('transaction_type', ['cart_purchase', 'seller_delivery'])` with NO `parent_group` filter. This means the APNs function may get a different (smaller) set of flow entries than the client, causing mismatched `progressPercent` and `progressStage` values between client-triggered and server-triggered updates.

**Fix:** Align the edge function query with the client: use `.in("transaction_type", ["cart_purchase", "seller_delivery"])` and remove the `parent_group` filter. Remove `parent_group` from `LAUpdatePayload` interface.

---

## Finding 3: `syncActiveOrders` does not pass `order_number` to mapper (MEDIUM)

**File:** `src/services/liveActivitySync.ts` line 57

The orders query selects `id, status, seller_id` but not `order_number`. The `buildLiveActivityData` function accepts `order.order_number` for generating a readable short ID (e.g., `#1234`). Without it, all Live Activity cards fall back to the last 4 hex chars of the UUID, which is less recognizable for buyers.

**Fix:** Add `order_number` to the select query in `syncActiveOrders`.

---

## Finding 4: Orchestrator `handleOrderUpdate` does not pass `order_number` (MEDIUM)

**File:** `src/hooks/useLiveActivityOrchestrator.ts` line 127

When processing realtime order updates, `buildLiveActivityData` is called with `{ id: orderId, status: newStatus }` -- no `order_number`. Same effect as Finding 3.

**Fix:** Include `order_number` in the order payload from the realtime event (`payload.new`), or fetch it from the DB alongside other data.

---

## Finding 5: Orchestrator `handleOrderUpdate` does not pass `sellerLogoUrl` (MEDIUM)

**File:** `src/hooks/useLiveActivityOrchestrator.ts` lines 117-132

When a realtime order update triggers, the code fetches `business_name` from `seller_profiles` but does not fetch `logo_url`. The `buildLiveActivityData` call omits the `sellerLogoUrl` parameter entirely. This means Live Activity updates triggered by realtime events will lose the seller logo that was present during initial sync.

**Fix:** Add `logo_url` to the seller profile select, and pass it as the `sellerLogoUrl` argument.

---

## Finding 6: Swift `OrderPhase.from()` has hardcoded status-to-phase mapping (LOW -- acceptable)

**File:** `native/ios/LiveDeliveryWidget.swift` lines 57-67

The `OrderPhase.from()` switch maps status strings to visual phases. This runs on-device in the widget extension and cannot make DB calls. The mapping covers all known statuses and has a safe default (`.confirmed`). This is an acceptable native-layer constraint -- the status keys themselves are DB-backed, and the widget simply maps them to visual representations.

No action needed.

---

## Finding 7: `LiveActivityManager` hardcoded fallback sets are defensive only (LOW -- acceptable)

**File:** `src/services/LiveActivityManager.ts` lines 42-47

The hardcoded `TERMINAL_STATUSES` and `START_STATUSES` are fallbacks used only if `loadStatusSets()` fails. They are immediately replaced by DB-backed values during hydration. This is correct defensive programming.

No action needed.

---

## Verified: All Previously Fixed Items

| Area | Status | Evidence |
|------|--------|----------|
| GPS filtering (Kalman-lite) | Verified | `gps-filter.ts` + `useDeliveryTracking.ts` |
| Smooth marker interpolation | Verified | CSS transitions in `OrderDetailPage` |
| OSRM road ETA | Verified | `useOSRMRoute` hook |
| Proximity states (DB-backed) | Verified | `proximity_thresholds` in system_settings |
| Deep link 404 prevention | Verified | `KNOWN_ROUTES` validation in `useDeepLinks.ts` |
| Live Activity dedup (hydration) | Verified | `_doHydrate()` in `LiveActivityManager` |
| Native-layer dedup (start) | Verified | `getActiveActivities()` check before `startLiveActivity` |
| Activity lifecycle termination | Verified | Terminal status check in `push()` |
| Stale ETA suppression | Verified | `getSmartEta` returns null when stale |
| Cart race conditions | Verified | Mutation barrier + reconciliation in `useCart` |
| DB-backed active statuses (sync) | Verified | `getStartStatuses()` in `liveActivitySync.ts` |
| DB-backed flow entries (orchestrator) | Verified | `seller_delivery` included in query |
| DB-backed emoji config | Verified | `delivery_status_labels` in `DeliveryStatusCard` |
| AddressPicker forwardRef | Verified | Wrapped in `React.forwardRef` |

---

## Implementation Plan

| Step | What | Severity | Files |
|------|------|----------|-------|
| 1 | Replace hardcoded `TERMINAL_STATUSES` in APNs edge function with DB query | High | `supabase/functions/update-live-activity-apns/index.ts` |
| 2 | Align APNs flow query: use `.in()` for transaction_type, remove `parent_group` filter | High | `supabase/functions/update-live-activity-apns/index.ts` |
| 3 | Add `order_number` to sync query and orchestrator handler | Medium | `src/services/liveActivitySync.ts`, `src/hooks/useLiveActivityOrchestrator.ts` |
| 4 | Add `logo_url` to orchestrator's seller profile fetch and pass to mapper | Medium | `src/hooks/useLiveActivityOrchestrator.ts` |

