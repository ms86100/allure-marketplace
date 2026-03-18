

# Round 5 Production Readiness Audit — Verified Findings

Every gap from Rounds 3 and 4 has been verified against the live database and current codebase. Here is what remains.

---

## Status of Previous Fixes (All Confirmed Working)

- **OTP trigger:** `trg_generate_delivery_code` exists, generates 4-digit numeric codes. Confirmed `delivery_code = 9823` in live data.
- **OTP gate trigger:** `trg_enforce_delivery_otp` exists — blocks direct `delivered` updates.
- **RPCs:** `buyer_confirm_delivery`, `buyer_cancel_order`, `verify_delivery_otp_and_complete` all exist.
- **BuyerDeliveryConfirmation** uses `supabase.rpc('buyer_confirm_delivery')` — correct.
- **OrderCancellation** loads reasons from `system_settings` with fallback defaults — correct.
- **Proximity thresholds** stored in `system_settings` and loaded by `LiveDeliveryTracker` — correct.
- **Duplicate subscription fix:** `LiveDeliveryTracker` accepts `trackingState` prop, `OrderDetailPage` passes it — correct.
- **GPS filter applied in assignment channel** (useDeliveryTracking line 135) — correct.
- **OSRM road ETA** wired through `onRoadEtaChange` into `LiveDeliveryTracker` — correct.
- **Arrival overlay gated to buyer** (line 136 of OrderDetailPage) — correct.
- **Delivery code realtime subscription** (lines 106-117 of OrderDetailPage) — correct.
- **Needs attention banner** for buyer (lines 175-189) — correct.
- **Stalled monitor** flags `needs_attention` instead of cancelling, uses `stalled_notified` column — correct.
- **Deep link fix** with hostname+pathname reconstruction and KNOWN_ROUTES fallback — correct.
- **Live Activity dedup** in hydration and native-layer check in push() — correct.
- **Orchestrator active order ID filtering** for delivery channel — correct.
- **GPS jitter threshold** lowered to 1m — correct.
- **OSRM timeout + retry + route caching** — correct.
- **Heading icon churn** fixed with 10-degree threshold — correct.
- **Live Activity mapper** uses DB-backed `category_status_flows` for labels and progress — correct.
- **APNs edge function** queries `category_status_flows` at runtime — correct.

---

## Remaining Gaps

### Gap 1: LiveDeliveryTracker Status Messages Are Hardcoded (HIGH)

**Issue:** Lines 190-205 of `LiveDeliveryTracker.tsx` contain hardcoded status-to-text mappings like `'picked_up' -> '🚚 Your order has been picked up!'` and `'on_the_way' -> '🛵 Your order is on the way!'`. These are separate from the proximity messages (which ARE DB-backed). The `category_status_flows` table already has `buyer_hint` and `display_label` columns that should be used.

The user explicitly mandated "no hardcoding, everything DB-backed."

**Fix:** Fetch `buyer_hint` and `display_label` for the delivery assignment status from `category_status_flows` (the order status flow, not the delivery assignment status flow). Pass these labels into `LiveDeliveryTracker` or have it look up the text from a prop. Use `buyer_hint` for buyer view and construct seller messages from `display_label`.

### Gap 2: LiveActivityManager START_STATUSES and TERMINAL_STATUSES Are Hardcoded (MEDIUM)

**Issue:** `LiveActivityManager.ts` lines 41-58 hardcode which statuses are terminal and which should start an activity. If an admin adds a new status via the Workflow Manager (e.g., `quality_check`), the Live Activity system won't know about it.

**Fix:** Load the status flow entries at hydration time and derive terminal/start sets from `sort_order` and status keys. Statuses with the highest sort_orders (beyond `delivered`) are terminal; statuses between `accepted` and `delivered` are start statuses.

### Gap 3: `useLiveActivityOrchestrator` TERMINAL_STATUSES Duplicated and Hardcoded (MEDIUM)

**Issue:** The orchestrator has its own copy of `TERMINAL_STATUSES` at line 12. Same problem as Gap 2.

**Fix:** Share a single source of truth with `LiveActivityManager`, or both derive from DB flow entries.

### Gap 4: `monitor-stalled-deliveries` Notification Messages Are Hardcoded (MEDIUM)

**Issue:** Lines 58-72 of the edge function hardcode notification titles and bodies like "Delivery update paused" and "GPS tracking paused for over 10 minutes." Per the user's requirement, these should come from `system_settings`.

**Fix:** Add system_settings keys like `stalled_delivery_buyer_title`, `stalled_delivery_buyer_body`, `stalled_delivery_seller_title`, `stalled_delivery_seller_body`. Fetch them in the edge function with fallback defaults.

### Gap 5: `DeliveryArrivalOverlay` Messages Are Hardcoded (MEDIUM)

**Issue:** The arrival overlay component likely has hardcoded text for proximity stages. Should use the DB-backed proximity config.

**Fix:** Pass the proximity config into the overlay component.

---

## Summary

| # | Gap | Severity | Type |
|---|-----|----------|------|
| 1 | LiveDeliveryTracker status messages hardcoded | High | Frontend |
| 2 | LiveActivityManager status sets hardcoded | Medium | Frontend |
| 3 | Orchestrator TERMINAL_STATUSES duplicated | Medium | Frontend |
| 4 | Stalled delivery notification text hardcoded | Medium | Edge Function |
| 5 | DeliveryArrivalOverlay messages hardcoded | Medium | Frontend |

All Critical and High issues from Rounds 3 and 4 are resolved and verified. The remaining items are all about the "no hardcoding" requirement — moving the last hardcoded strings to the database.

## Implementation Plan

| Step | What | Files |
|------|------|-------|
| 1 | Replace hardcoded status messages in LiveDeliveryTracker with DB-backed buyer_hint/display_label from category_status_flows | `LiveDeliveryTracker.tsx` |
| 2 | Derive START/TERMINAL status sets from category_status_flows in LiveActivityManager | `LiveActivityManager.ts`, `liveActivitySync.ts` |
| 3 | Remove duplicated TERMINAL_STATUSES from orchestrator, use shared source | `useLiveActivityOrchestrator.ts` |
| 4 | Move stalled delivery notification text to system_settings | Migration (data insert) + `monitor-stalled-deliveries/index.ts` |
| 5 | Pass proximity config into DeliveryArrivalOverlay | `DeliveryArrivalOverlay.tsx`, `OrderDetailPage.tsx` |

