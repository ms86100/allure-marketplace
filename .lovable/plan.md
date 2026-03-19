

# Round 2: Live Activity + Tracking + Notification — Production Audit

## Summary

Round 1 fixes successfully eliminated all critical hardcoded status sets from the Live Activity stack. The three-tier fallback (DB → expired cache → KV → safe minimum) is correctly implemented. The `starts_live_activity` DB column is in place and populated. The push handler now resolves terminal statuses dynamically.

**Overall verdict: The core architecture is now DB-driven and production-ready, with 3 remaining issues (1 High, 2 Medium).**

---

## SECTION 1: Findings

### Issue 1 — Hardcoded delivery-terminal guard in edge function
- **Location:** `supabase/functions/update-delivery-location/index.ts:145`
- **Code:** `['delivered', 'failed', 'cancelled'].includes(assignment.status)`
- **Severity:** High
- **User Impact:** If admin adds new terminal delivery statuses (e.g. `returned`, `failed_delivery`), location updates will still be processed for those assignments, wasting resources and potentially sending stale APNs pushes. More critically, `failed` is not in `category_status_flows` for `cart_purchase`/`seller_delivery` — this is a phantom status that may cause confusion.
- **Fix:** Replace with a DB-driven terminal check. Load terminal statuses from `category_status_flows` (already done later in the function for transit statuses — reuse the same pattern) or query the assignment's order status against the terminal set.

### Issue 2 — `STATUS_MESSAGES` map in useBuyerOrderAlerts is hardcoded
- **Location:** `src/hooks/useBuyerOrderAlerts.ts:15-26`
- **Severity:** Medium
- **User Impact:** Admin-added statuses (e.g. `quoted`, `scheduled` are present but others like `at_gate`, `enquired`, `in_progress` are missing) won't show any toast to the buyer. The toast silently fails (`if (!msg) return`). This is a UX gap, not a crash, but means buyers get no real-time feedback for custom workflow steps.
- **Fix:** Fall back to DB `display_label` from `category_status_flows` when no hardcoded message exists. Query the flow entry for the status and use `display_label` as the toast title with a generic description.

### Issue 3 — `BuyerCancelBooking` hardcodes terminal status check
- **Location:** `src/components/booking/BuyerCancelBooking.tsx:37`
- **Code:** `['cancelled', 'completed', 'no_show', 'in_progress'].includes(status)`
- **Severity:** Medium
- **User Impact:** If admin adds new terminal statuses for service bookings, the cancel button would still show (it should be hidden). Low risk since the backend would reject the transition, but it's a UX inconsistency.
- **Fix:** Use `isTerminalStatus()` flow helper or check `is_terminal` from the flow data already available in the booking detail context.

---

## SECTION 2: Architecture Assessment (Post Round 1)

| System | Round 1 | Round 2 | Notes |
|--------|---------|---------|-------|
| **statusFlowCache three-tier fallback** | NEW | PASS | DB → expired cache → KV → safe fallback correctly implemented. KV keys in persistent-kv restore list. |
| **starts_live_activity column** | NEW | PASS | Column exists, populated for cart_purchase + seller_delivery non-terminal statuses. |
| **Push handler terminal resolution** | FAIL | PASS | `terminalStatusesRef` removed. Dynamic `getTerminalStatuses()` at event time + `is_terminal` payload flag. |
| **LiveActivityManager status sets** | FAIL | PASS | No hardcoded fallbacks. `loadStatusSets()` always re-fetches (no `statusSetsLoaded` gate). |
| **Orchestrator terminal cache** | FAIL | PASS | Starts empty, loaded from DB at init. Three-tier fallback propagates automatically. |
| **Transit statuses (client)** | FAIL | PASS | `visibilityEngine`, `liveActivityMapper`, `ActiveOrderStrip`, `useBuyerOrderAlerts` all use `getTrackingConfigSync().transit_statuses_la`. |
| **Transit statuses (edge function)** | FAIL | PASS | `update-delivery-location` loads `transit_statuses_la` from `system_settings`. Fallback to `['picked_up', 'on_the_way', 'at_gate']` only if DB key missing (acceptable). |
| **Deduplication (native)** | PASS | PASS | Hydration dedup + `starting` set + native `getActiveActivities()` check before start. |
| **Throttle terminal race** | PASS | PASS | `doUpdate` guard (`!this.active.has(data.entity_id)`) prevents stale timer firing after `end()`. |
| **APNs background updates** | PASS | PASS | Delta-based with 15s throttle floor. Terminal sends `event: "end"` with `dismissal-date`. |
| **Dynamic Island navigation** | PASS | PASS | Tap → `appStateChange` → deferred navigation via `sessionStorage`. |
| **Notification dedup** | PASS | PASS | 30s cool-down in DB trigger + toast ID dedup in frontend. |
| **Multi-device** | PASS | PASS | Per-device APNs token via `apns_token` dedup. |
| **Visibility/resume sync** | PASS | PASS | Immediate sync on `visibilitychange` + `appStateChange`. Cache invalidation on resume. |
| **Polling safety net** | PASS | PASS | 15s heartbeat detects terminal orders missed by realtime. |

---

## SECTION 3: Missing DB Entries

- **`no_show` and `failed` are NOT in `cart_purchase` or `seller_delivery` flows.** The edge function checks for `failed` but it doesn't exist in the flow config. This is a data gap — if a delivery partner marks an order as `failed`, the system has no flow entry for it.
- **Recommendation:** Add `no_show` (is_terminal=true) and `failed` (is_terminal=true) to `cart_purchase` and `seller_delivery` flows, or remove the `failed` check from the edge function if it's not a valid business status.

---

## SECTION 4: Fix Plan

### Fix 1: Edge function delivery-terminal guard (High)
**File:** `supabase/functions/update-delivery-location/index.ts:145`
- Load terminal statuses from `category_status_flows` (or reuse the `transit_statuses_la` system_settings query pattern to also load terminal statuses)
- Replace `['delivered', 'failed', 'cancelled'].includes(...)` with `terminalStatuses.includes(assignment.status)`
- Cache within the function invocation (single request scope)

### Fix 2: DB-driven toast fallback in useBuyerOrderAlerts (Medium)
**File:** `src/hooks/useBuyerOrderAlerts.ts`
- Keep `STATUS_MESSAGES` as a rich override map (icons, custom descriptions)
- When `STATUS_MESSAGES[newStatus]` is undefined, fetch/cache the `display_label` from `category_status_flows` and show a generic toast with that label
- This makes admin-added statuses visible to buyers without requiring code changes

### Fix 3: BuyerCancelBooking terminal check (Medium)
**File:** `src/components/booking/BuyerCancelBooking.tsx:37`
- Replace hardcoded array with flow-aware terminal check using the order's flow data (already available in parent context)

### Fix 4 (Data): Add `failed` status to delivery flows
**Migration:** Insert `failed` as `is_terminal=true, is_success=false` for `cart_purchase` and `seller_delivery` flows to match the edge function's expectation.

---

## Files to Modify

1. `supabase/functions/update-delivery-location/index.ts` — DB-driven terminal guard
2. `src/hooks/useBuyerOrderAlerts.ts` — Fallback to DB display_label for unknown statuses
3. `src/components/booking/BuyerCancelBooking.tsx` — Flow-aware terminal check
4. **Migration** — Add `failed` status to cart_purchase and seller_delivery flows

