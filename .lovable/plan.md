

# Production Readiness Audit: Delivery Tracking & Order Status System

## 1. COMPONENT-BY-COMPONENT ASSESSMENT

---

### A. Order & Delivery Status System

**Status transition enforcement (`validate_order_status_transition`):**
Two versions exist in migrations. The newer one (20260301) replaces the older (20260222). The newer version uses `category_status_flows` and enforces `_new_sort = _current_sort + 1`. It correctly allows cancellation from any state.

**Backwards compatibility escape hatch is too wide:** If `_current_sort` or `_new_sort` is NULL (status not in flow config), the trigger returns NEW — allowing the transition. This means any status NOT seeded in `category_status_flows` can be freely set, bypassing all validation.

**Sync trigger (`sync_delivery_to_order_status`):**
- `picked_up`: updates orders where `status = 'ready'` → sort 4→5 ✅ passes validation
- `at_gate`: updates orders where `status = 'picked_up'` → maps to `on_the_way`, sort 5→6 ✅
- `delivered`: updates orders `WHERE id = NEW.order_id` — **NO status precondition filter**. If somehow order is at `ready` (sort 4) and delivery jumps to `delivered`, this tries sort 4→7 — **blocked by validation trigger** (4+1 ≠ 7). So it fails silently — order stays at `ready` while delivery says `delivered`. **This is a P0 data drift bug.**

**Seller constraint enforcement:**
- `getNextStatusForActor` correctly returns `null` when next step's actor ≠ 'seller'
- For food flow, after `ready` (sort 4, actor=seller), next is `picked_up` (actor=delivery) → seller sees no next button ✅
- DB trigger does NOT check actor — it only checks sort order sequence. A seller could theoretically call `supabase.from('orders').update({status:'picked_up'})` directly and it would pass (sort 4→5, +1 valid). **Actor enforcement is UI-only, not DB-enforced.**

---

### B. GPS Location Tracking

**`update-delivery-location` edge function:**
- Uses `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS ✅ for inserts
- **NO AUTHENTICATION CHECK.** `verify_jwt = false` in config.toml AND no `getClaims()` or auth header validation in code. **Anyone with the function URL and a valid assignment_id can inject fake GPS coordinates.** This is a **P0 security vulnerability.**
- No rate limiting beyond the client-side 10s throttle
- No validation that the caller is the assigned delivery partner

**`delivery_locations` table:**
- RLS enabled, SELECT restricted to buyer/seller of the order ✅
- No INSERT policy for authenticated users — relies on edge function (service role) ✅
- Realtime enabled ✅

**`useBackgroundLocationTracking` hook:**
- Throttles to 10s ✅
- Handles permission denied gracefully ✅
- Converts m/s → km/h correctly ✅
- Auto-starts on `picked_up`, auto-stops on `delivered`/`failed`/`cancelled` ✅
- Cleanup on unmount ✅

---

### C. Buyer Live Tracking Experience

**`LiveDeliveryTracker.tsx`:**
- Text-only display (no Google Maps embed actually rendered) — this is acceptable for v1
- Shows ETA badge, distance, proximity messages, rider info, phone link ✅
- Last-seen staleness indicator when >3 min ✅
- Graceful: no map = no crash ✅
- **No error boundary wrapping** — a runtime error in this component could crash the order detail page

**`useDeliveryTracking` hook:**
- Subscribes to Realtime on `delivery_assignments` for status/ETA/distance ✅
- Subscribes to Realtime on `delivery_locations` for live GPS ✅
- Initial fetch on mount ✅
- Cleanup on unmount ✅
- **Queries `rider_name`, `rider_phone`, `rider_photo_url`** — these columns may not exist on `delivery_assignments`. The existing schema has `partner_id` referencing a user, not denormalized name/phone fields. This will return null silently (no crash) but rider info will never display.

---

### D. Notifications & Buyer Awareness

**Status-driven notifications (`enqueue_order_status_notification`):**
- Triggers on `orders` UPDATE/INSERT ✅
- The newer version (20260301) adds templates for `on_the_way`, `arrived`, `assigned` ✅

**Proximity notifications (edge function):**
- Idempotency check: queries `notification_queue` for existing `delivery_proximity` notification before inserting ✅
- Stale detection: checks `last_location_at` gap >3 min, marks `stalled_notified = true` to avoid spam ✅
- Calls `process-notification-queue` fire-and-forget ✅

**Gap:** The `enqueue_order_status_notification` fires on `orders.status` changes. When the sync trigger updates `orders.status` to `picked_up` or `on_the_way`, this will correctly fire notifications. But if the sync trigger's `delivered` case fails silently (P0 bug above), the buyer never gets a "delivered" notification from the order status trigger.

---

### E. Scheduling & Automation

**pg_cron:**
- No cron job exists for stall detection or timeout escalation. The `ready_at` column was added but no scheduled function checks for stuck orders.
- Stale detection only runs passively — when a new GPS update arrives, it checks the gap. If GPS stops entirely, no detection occurs.

---

## 2. PRODUCTION READINESS EVALUATION

| Category | Verdict | Reasoning |
|----------|---------|-----------|
| **A. Safety & Abuse Prevention** | **PARTIALLY** | Seller cannot advance past `ready` in UI, but DB trigger does not enforce actor — a direct API call can bypass. Edge function has zero auth — anyone can inject fake GPS. |
| **B. Data Integrity & Consistency** | **PARTIALLY** | The `delivered` sync case has no status precondition, causing silent failure and drift between `delivery_assignments` and `orders`. Backwards-compat NULL escape allows uncontrolled transitions for unmapped statuses. |
| **C. Real-Time Reliability** | **YES** | Realtime subscriptions are correctly set up. UI degrades to text-only gracefully. Last-seen indicator handles stale data. |
| **D. Notification Correctness** | **PARTIALLY** | Proximity notifications are idempotent. But if `delivered` sync fails silently, buyer misses the delivered notification. |
| **E. Scale & Load Risk** | **YES** | 10s throttle bounds updates per delivery. No unbounded loops. Realtime channels are scoped per assignment. |

---

## 3. GAP IDENTIFICATION

### P0 — Production Blockers

**GAP 1: Edge function has zero authentication**
- Component: `supabase/functions/update-delivery-location/index.ts`
- The function accepts any request with a valid `assignment_id`. No JWT validation, no caller identity check. Anyone can spoof rider location, manipulate ETA, and trigger fake proximity notifications to buyers.
- Impact: Complete trust violation. Fake "at doorstep" notifications. GPS data integrity destroyed.

**GAP 2: `delivered` sync trigger missing status precondition**
- Component: `sync_delivery_to_order_status` trigger, line 13-14
- The `delivered` case does `UPDATE orders SET status = 'delivered' WHERE id = NEW.order_id` without checking current order status. If order is not at `on_the_way` (e.g., still at `ready` because `picked_up`/`on_the_way` syncs failed), the validation trigger blocks it silently. Order stays stuck while delivery shows `delivered`.
- Impact: Buyer never sees delivery complete. Order stuck permanently. No error surfaced.

### P1 — Serious Issues

**GAP 3: Actor not enforced at DB level**
- Component: `validate_order_status_transition` trigger
- The trigger validates sort_order sequence but not actor. A seller making a direct Supabase client call (bypassing the UI) can advance to `picked_up` or `delivered` as long as it's the next sort_order step.
- Impact: Seller abuse possible via direct API. Mitigated by UI constraints but not secure.

**GAP 4: `rider_name`/`rider_phone`/`rider_photo_url` columns may not exist**
- Component: `useDeliveryTracking.ts` initial fetch query
- The hook queries these columns from `delivery_assignments`. If they don't exist in the schema, the query won't fail but returns null — rider info section in `LiveDeliveryTracker` will always be empty.
- Impact: Buyer never sees who is delivering. Reduced trust.

### P2 — Operational Gaps

**GAP 5: No active stall detection when GPS stops entirely**
- Component: Missing cron job
- Stale detection only triggers when a NEW GPS update arrives and checks the previous gap. If GPS stops completely, no mechanism detects or alerts.
- Impact: Delivery can silently stall with no buyer notification.

---

## 4. MINIMAL CORRECTIVE ACTIONS

### Fix 1 (P0): Add authentication to edge function
- **What must change:** Add `getClaims()` check at the top of `update-delivery-location/index.ts`. Validate that `data.claims.sub` matches `assignment.partner_id`.
- **What must NOT change:** The ETA calculation, proximity logic, notification logic — all stay as-is.
- **Why unavoidable:** Without this, any anonymous user can inject fake GPS data and trigger notifications to buyers.

### Fix 2 (P0): Add status precondition to `delivered` sync case
- **What must change:** In `sync_delivery_to_order_status`, change line 13-14 from:
  `UPDATE orders SET status = 'delivered' WHERE id = NEW.order_id;`
  to:
  `UPDATE orders SET status = 'delivered' WHERE id = NEW.order_id AND status = 'on_the_way';`
- **What must NOT change:** The trigger structure, the other cases — all stay as-is.
- **Why unavoidable:** Without this, delivered status can silently fail to sync, leaving orders permanently stuck.

### Fix 3 (P1): Add actor check to DB validation trigger
- **What must change:** In `validate_order_status_transition`, after the sort_order check, add: if `_new_actor` in (`delivery`, `system`) and the caller is not service_role, raise exception.
- **What must NOT change:** Sort order validation, cancellation bypass, backwards-compat — all stay as-is.
- **Why:** Prevents seller from bypassing UI constraints via direct API calls.

---

## 5. FINAL VERDICT

**❌ Not safe for production** — due to two P0 gaps:

1. The edge function accepting unauthenticated GPS injections is a critical security hole that would allow any user to fake delivery locations and trigger misleading notifications.
2. The `delivered` sync trigger can silently fail, leaving orders permanently stuck in an intermediate state with no error surfaced to any party.

**Conditions to reach ⚠️ Conditionally Ready:**
- Fix 1 and Fix 2 applied (minimal, targeted changes)
- Manual verification that `rider_name`/`rider_phone` columns exist (or accept empty rider info at launch)

**Known limitations accepted at launch (post-fixes):**
- No Google Maps visual — text-only tracking (acceptable for v1)
- No active stall detection cron — only passive detection on next GPS update
- Actor enforcement is UI-level only (P1 risk accepted if direct API abuse is unlikely in gated community context)
- No timeout escalation for stuck-at-ready orders (operational, not safety-critical)

**Residual risk ownership:**
- Platform ops team must monitor `delivery_assignments` vs `orders` status alignment manually until active cron monitoring is added
- GPS accuracy issues handled gracefully (skip ETA when >100m accuracy) — acceptable

