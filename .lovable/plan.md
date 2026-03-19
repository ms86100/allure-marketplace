

# Production Audit: Live Tracking, Live Activity, Dynamic Island & Notifications

## HOW IT IS TODAY vs HOW IT SHOULD BE

---

### CRITICAL BUG: `failed` is not a valid `order_status` enum value

**Today:** The `statusFlowCache.ts` hardcodes `'failed'` in `getTerminalStatuses()` as a safety net. This propagates to `ActiveOrderStrip`, which builds a PostgREST filter including `failed`. The database rejects it with `22P02: invalid input value for enum order_status: "failed"`. This means **the ActiveOrderStrip query returns a 400 error on every page load**, silently failing — so no active order cards ever render on the home page.

**Should be:** Only use enum values that actually exist in the database. The safety-net list must match the real enum: `delivered, completed, cancelled, no_show` (no `failed`).

**Severity:** CRITICAL — ActiveOrderStrip is completely broken for all users.

**Affected files:**
- `src/services/statusFlowCache.ts` (line 41) — hardcoded `'failed'`
- `src/services/LiveActivityManager.ts` (line 43) — hardcoded `'failed'`
- `supabase/functions/update-live-activity-apns/index.ts` (line 31) — hardcoded `'failed'`

---

### ISSUE 2: Home Notification Banner still shows stale delivery notifications

**Today:** The client-side fix in `useLatestActionNotification` fetches 5 notifications and checks each against the order status. This works — the network logs show it correctly marks them as read one by one. But it processes them **sequentially** (one per query cycle with 10s staleTime), so a user with 5+ stale notifications sees the banner flash for ~2 seconds per notification before each gets auto-dismissed. The DB trigger `trg_auto_dismiss_delivery_notifications` should have handled this at the database level, but it only fires on future status transitions — it doesn't retroactively clean up the 5 notifications that were created before the trigger existed.

**Should be:** A one-time data cleanup should mark all existing delivery notifications for completed/delivered orders as read. The client-side waterfall is a symptom, not the fix.

**Severity:** HIGH — affects current users with existing stale notifications.

---

### ISSUE 3: Notification banner cleanup is a sequential waterfall

**Today:** `useLatestActionNotification` fetches 5 notifications, then for each delivery notification, makes a separate query to `orders` to check status, then a PATCH to mark it read, then continues to the next. This creates up to 15 sequential network requests in the query function. The banner flickers as React Query refetches after each mutation.

**Should be:** Mark ALL stale notifications in a single pass (batch update), then return the first valid one. Or better — the DB trigger handles it and the client never sees stale notifications.

**Severity:** MEDIUM — poor UX but self-correcting.

---

### ISSUE 4: Live Activity lifecycle is sound but has one gap

**Today:** The orchestrator correctly handles:
- Start → Update → End lifecycle tied to DB status
- Deduplication via `starting` set + native `getActiveActivities()` check
- Hydration cleanup on app resume
- Terminal status → `end()` on realtime UPDATE
- Stale activity cleanup on sync (orders that became terminal while backgrounded)
- APNs push for background/killed app updates
- 5s throttle with pending timer for rapid updates
- Max 10 concurrent activities

**Gap:** When the realtime channel dies (after 3 failed reconnects), the 45s polling heartbeat only checks for status **changes** (mismatch vs `lastKnownRef`). If an order transitions to terminal while both realtime AND polling are down, the Live Activity persists until the next app resume triggers `doSync()`. This is an edge case but violates the "always terminate" requirement.

**Should be:** The polling heartbeat should also check if any tracked Live Activity entities have become terminal, not just check for status changes in active orders.

**Severity:** MEDIUM — edge case, but can cause Dynamic Island to persist.

---

### ISSUE 5: Dynamic Island tap navigation

**Today:** Deep links are deferred via `sessionStorage` until auth hydrates (per memory). The `useOrderDetail` hook now refetches on visibility change and custom events. This is correctly implemented.

**Should be:** This is working as designed. No issue found.

---

### ISSUE 6: Notification deduplication and silent push

**Today:** The `fn_enqueue_order_status_notification` trigger has a 30s cooldown per order/status combo. The `silent_push` flag is used for mid-flow statuses when a Live Activity is active. Critical events always trigger full push.

**Gap identified from network data:** The order `19330a43` has duplicate `delivery_proximity` notifications (IDs `23c46ec3` and `b8ebb8ef`) created 2.6 seconds apart with identical payloads. The 30s cooldown is per `order_id + status_key`, but `delivery_proximity` is a notification `type`, not a `status_key`. The dedup logic in `fn_enqueue_order_status_notification` may not cover delivery event notifications (delayed, stalled, proximity) — these are likely enqueued by a different trigger/function.

**Should be:** Delivery event notifications (proximity, delayed, stalled) should also have dedup logic — at minimum, a 30s cooldown per order + notification type.

**Severity:** HIGH — causes notification spam visible in the user's notification list.

---

### ISSUE 7: ETA and progress accuracy during transit

**Today:** During transit, `progressPercent` uses `1 - (eta_minutes / 45)` clamped to [0.1, 0.95]. The `MAX_ETA` of 45 minutes is hardcoded. For short deliveries within a society (likely 5-10 min max), the progress bar jumps to 0.78+ immediately.

**Should be:** `MAX_ETA` should be derived from `delivery_time_stats` or the order's initial estimated delivery time, not hardcoded to 45 minutes. For intra-society deliveries, a 10-15 min max would produce meaningful progress.

**Severity:** MEDIUM — misleading but not broken.

---

## PLAN

### Fix 1: Remove `failed` from all hardcoded terminal status lists
Remove `'failed'` from:
- `src/services/statusFlowCache.ts` line 41
- `src/services/LiveActivityManager.ts` line 43
- `supabase/functions/update-live-activity-apns/index.ts` line 31

This immediately unblocks `ActiveOrderStrip`.

### Fix 2: One-time data cleanup for stale notifications
Run a data update (via insert tool) to mark all delivery notifications as read for orders that are already delivered/completed/cancelled.

### Fix 3: Batch cleanup in useLatestActionNotification
Refactor the sequential waterfall into a single query that joins notifications with orders, batch-marks stale ones, and returns the first valid notification — eliminating the flicker.

### Fix 4: Polling heartbeat terminal check
In the 45s polling heartbeat, also query `LiveActivityManager` for tracked entities and check if any have become terminal, calling `end()` if so.

### Fix 5: Delivery notification dedup
Add dedup logic for delivery event notifications (proximity, delayed, stalled) — either in the edge function that creates them or via a DB constraint.

| Fix | Severity | Files |
|-----|----------|-------|
| Remove `failed` enum | CRITICAL | statusFlowCache.ts, LiveActivityManager.ts, update-live-activity-apns/index.ts |
| Data cleanup | HIGH | DB data update |
| Batch notification cleanup | MEDIUM | useNotifications.ts |
| Polling terminal check | MEDIUM | useLiveActivityOrchestrator.ts |
| Delivery notification dedup | HIGH | Edge function or DB trigger |

