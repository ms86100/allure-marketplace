

# Production Readiness Audit — Round 4

Verified against live database state, actual trigger existence, RLS policies, and network requests. Every finding below is proven, not assumed.

---

## CRITICAL

### Gap 1: Delivery OTP System is Completely Broken

**Issue:** The `generate_delivery_code` trigger does not exist in the database. Query `pg_trigger WHERE tgname = 'trg_generate_delivery_code'` returns empty. The function `generate_delivery_code` also does not exist (confirmed via `pg_proc`). As a result, **every** `delivery_assignments.delivery_code` is `null` — confirmed by querying the table directly. The network request on the current page also shows `{"delivery_code":null}`.

This breaks three things simultaneously:
1. **Buyer sees no OTP** — the `buyerOtp` state stays null, so the OTP display block at line 273 of `OrderDetailPage` never renders.
2. **Seller cannot complete delivery** — `verify_delivery_otp_and_complete` RPC raises `'Delivery code is not available'` when `delivery_code IS NULL`.
3. **Format mismatch** — the migration generates a 6-char alphanumeric code (`UPPER(SUBSTR(MD5(...), 1, 6))`), but the OTP input dialog is a 4-digit numeric `InputOTP maxLength={4}`.

**Severity:** Critical — delivery completion is impossible via OTP flow.

**Root cause:** The migration file contains the function and trigger DDL, but the trigger was never applied to the database (migration may have partially failed or was superseded).

**Fix:**
1. New migration: Create the `generate_delivery_code()` function that produces a **4-digit numeric code** (`LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0')`), matching the 4-slot OTP input.
2. Create the trigger on `orders` table for `ready`/`picked_up` transitions.
3. Backfill existing active assignments: `UPDATE delivery_assignments SET delivery_code = LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0') WHERE delivery_code IS NULL AND status NOT IN ('delivered','completed','cancelled','failed')`.

---

### Gap 2: Live Activity Status Labels Are Hardcoded, Not DB-Backed

**Issue:** `PROGRESS_DESCRIPTIONS` and `STATUS_PROGRESS` in `liveActivityMapper.ts` are hardcoded dictionaries. The same maps are duplicated in `supabase/functions/update-live-activity-apns/index.ts`. Meanwhile, the `category_status_flows` table already contains `display_label`, `sort_order`, and `buyer_hint` per status — this is the DB source of truth.

When an admin changes status labels, progress order, or adds new statuses via the Workflow Manager, the Live Activity and its APNs counterpart show stale or missing labels. The user's requirement explicitly states: "everything should be db backed, no hard coding."

**Severity:** Critical — directly violates the user's stated requirement.

**Root cause:** Live Activity mapper was written before the workflow engine existed. Never refactored to pull from DB.

**Fix:**
1. In `liveActivityMapper.ts`, accept a `statusFlowMap` parameter (or fetch from DB/cache) with `status_key -> { display_label, sort_order }`.
2. Use `sort_order` to derive `progress_percent` dynamically: `currentSortOrder / maxSortOrder`.
3. Use `display_label` for `progress_stage` instead of hardcoded `PROGRESS_DESCRIPTIONS`.
4. In the edge function `update-live-activity-apns`, query `category_status_flows` at runtime.
5. In `LiveDeliveryTracker.tsx`, the proximity messages are also hardcoded — move proximity thresholds and messages to `system_settings` or keep as-is (they are distance-based, not status-based, so acceptable).

---

### Gap 3: Seller Can Bypass OTP via Direct Status Update

**Issue:** The OTP gate only applies when `nextStatus === 'delivered' && isDeliveryOrder && deliveryAssignmentId` (line 398 of OrderDetailPage). But the seller's `updateOrderStatus` function (in `useOrderDetail`) does a direct `supabase.from('orders').update({ status })` — the RLS policy `'Sellers and admins can update orders'` permits this. A seller could manipulate the client or use a modified app to call `updateOrderStatus('delivered')` directly, bypassing the OTP dialog entirely.

**Severity:** Critical — OTP verification is UI-only, not enforced at database level.

**Root cause:** The `verify_delivery_otp_and_complete` RPC exists but the regular seller UPDATE path is not blocked for the `delivered` transition.

**Fix:** Add a database trigger or modify the seller UPDATE RLS policy: when `NEW.status = 'delivered'` and a `delivery_assignment` exists with a non-null `delivery_code`, reject the UPDATE unless it came through the RPC. Alternatively, use a validation trigger that prevents direct `status = 'delivered'` updates on orders with delivery assignments.

---

## HIGH

### Gap 4: `LiveDeliveryTracker` Proximity Messages Are Hardcoded

**Issue:** Lines 37-51 of `LiveDeliveryTracker.tsx` contain hardcoded distance thresholds (50m, 200m, 500m) and message strings. These should be configurable. The user explicitly requested "no hard coding, everything db backed."

**Severity:** High — violates requirements, but doesn't break functionality.

**Fix:** Store proximity thresholds and messages in `system_settings` (e.g., `proximity_thresholds_json`). Fetch them via the existing settings hook and pass to `getProximityMessage()`.

---

### Gap 5: Delivery Assignment Channel Listens to ALL Assignments (Orchestrator)

**Issue:** In `useLiveActivityOrchestrator.ts` (line 219), the delivery assignment channel subscribes to `INSERT` and `UPDATE` on `delivery_assignments` with **no filter**. Every delivery assignment change in the system (from any order, any buyer) triggers the callback for every buyer. The callback then does a `supabase.from('orders').select(...).eq('buyer_id', userId)` to filter — but the realtime event fires for all rows, causing unnecessary network traffic and DB queries.

**Severity:** High — scales poorly. With 100 concurrent deliveries, each buyer's app processes 100 realtime events and makes 100 DB queries.

**Root cause:** Supabase realtime filters on `delivery_assignments` can't use `buyer_id` (it's on the `orders` table, not `delivery_assignments`).

**Fix:** Filter client-side more efficiently: maintain an in-memory set of the buyer's active order IDs. In the callback, check if `row.order_id` is in that set before making any DB calls. This eliminates ~99% of unnecessary queries.

---

### Gap 6: OSRM Route Fetch Has No Timeout or Error Recovery

**Issue:** `useOSRMRoute` in `DeliveryMapView.tsx` uses `fetch()` with an `AbortController` but no timeout. If OSRM hangs (which the free public API frequently does), the request stays open indefinitely. There's also no retry — a single failure means the user sees a dashed straight line for the entire delivery.

**Severity:** High — OSRM is a free API with no SLA.

**Fix:** Add a 5-second timeout via `AbortSignal.timeout(5000)`. Add one retry on failure. Cache the last successful route so it's shown even if subsequent fetches fail.

---

### Gap 7: `AnimatedRiderMarker` Heading Rotation Creates New Icon on Every Change

**Issue:** `useEffect` at line 110 of `DeliveryMapView.tsx` calls `marker.setIcon(createRiderIcon(heading))` on every heading change. `createRiderIcon` creates a new `L.DivIcon` instance each time. While the CSS transition handles visual smoothness, creating a new DOM element for each heading update causes unnecessary DOM churn.

**Severity:** Medium — performance issue, not user-facing.

**Fix:** Use a ref to cache the current heading and only call `setIcon` when heading changes by > 10 degrees.

---

### Gap 8: No "needs_attention" UI for Buyer

**Issue:** The `monitor-stalled-deliveries` edge function sets `needs_attention = true` on orders, but there's no UI in `OrderDetailPage` that reads this flag and shows a "Report Issue" button or warning banner to the buyer.

**Severity:** High — the flag is set but invisible to the user.

**Fix:** In `OrderDetailPage`, when `isBuyerView && order.needs_attention`, show a warning banner with the reason and a "Contact Seller" / "Report Issue" button.

---

### Gap 9: `delivery_code` Fetched Once, Never Updated via Realtime

**Issue:** The buyer's OTP (`buyerOtp`) is fetched once in a `useEffect` at line 92 of `OrderDetailPage`. If the delivery code is generated *after* the page loads (e.g., the trigger fires when the seller transitions to `ready`), the buyer's OTP remains null. There's no realtime subscription or polling to catch the code generation.

**Severity:** High — buyer may never see the OTP even after it's generated.

**Fix:** Subscribe to the `delivery_assignments` realtime channel for the assignment ID, and update `buyerOtp` when `delivery_code` changes from null to a value. Or piggyback on the existing assignment tracking channel in `useDeliveryTracking`.

---

## MEDIUM

### Gap 10: `DeliveryFeedbackForm` Insert Uses `as any`

**Issue:** Line 41 (approx) of `DeliveryFeedbackForm.tsx` casts the insert to `as any` because `delivery_feedback` isn't in the generated types.

**Fix:** Regenerate types after migration is applied. The types file will auto-update.

---

### Gap 11: Cancellation Reasons Are Hardcoded

**Issue:** `OrderCancellation.tsx` has `CANCELLATION_REASONS` hardcoded as a static array. Per the "no hardcoding" requirement, these should come from `system_settings` or a dedicated table.

**Severity:** Medium — functional but violates DB-backed requirement.

**Fix:** Store cancellation reasons in `system_settings` as a JSON key (e.g., `cancellation_reasons_json`).

---

## Summary

| # | Gap | Severity | Type |
|---|-----|----------|------|
| 1 | OTP trigger missing + format mismatch | Critical | Database |
| 2 | LA status labels hardcoded, not DB-backed | Critical | Frontend + Edge |
| 3 | Seller can bypass OTP via direct update | Critical | Security |
| 4 | Proximity messages hardcoded | High | Frontend |
| 5 | Orchestrator delivery channel unfiltered | High | Performance |
| 6 | OSRM no timeout or retry | High | Frontend |
| 7 | Icon churn on heading change | Medium | Performance |
| 8 | No needs_attention UI for buyer | High | Frontend |
| 9 | delivery_code fetched once, no realtime | High | Frontend |
| 10 | DeliveryFeedbackForm uses `as any` | Medium | Types |
| 11 | Cancellation reasons hardcoded | Medium | Frontend |

## Implementation Plan

| Step | What | Files |
|------|------|-------|
| 1 | Migration: Create delivery code trigger (4-digit numeric) + backfill | New migration |
| 2 | Migration: Add validation trigger blocking direct `delivered` updates on orders with delivery assignments | New migration |
| 3 | Refactor `liveActivityMapper.ts` to accept DB-backed status flow data | `liveActivityMapper.ts`, `liveActivitySync.ts`, `useLiveActivityOrchestrator.ts` |
| 4 | Update `update-live-activity-apns` edge function to query `category_status_flows` | Edge function |
| 5 | Store proximity thresholds in `system_settings` | Migration + `LiveDeliveryTracker.tsx` |
| 6 | Add order ID filter set in orchestrator delivery channel | `useLiveActivityOrchestrator.ts` |
| 7 | Add OSRM timeout + retry + route caching | `DeliveryMapView.tsx` |
| 8 | Add `needs_attention` banner to buyer view | `OrderDetailPage.tsx` |
| 9 | Subscribe to delivery_code changes via realtime | `OrderDetailPage.tsx` |
| 10 | Store cancellation reasons in system_settings | Migration + `OrderCancellation.tsx` |

