

## Verification Summary

**✅ Confirmed working:**
- DB trigger `trg_sync_notification_columns` exists and active
- Backfill ran — `data` and `action_url` populated for legacy rows
- Console: `[Inbox] fetched 30 notifications (mode=seller)` — **inbox bug fixed**
- Role-aware filters live in both `useNotifications` and `useUnreadNotificationCount`
- `notification-diagnostics` edge function deployed
- All 3 device tokens for seller user have `apns_token` ✅
- Last queue item (yesterday) processed cleanly

**⚠️ Not yet verified (gaps):**

### Gap 1 — Push delivery never end-to-end tested
`notification_queue` has had 0 new rows since 2026-04-17 11:59. We never observed a real "order placed → push arrives on device" cycle. The credentials path may still throw. Need to invoke a live test and inspect logs.

### Gap 2 — `processed` status is ambiguous
Current code marks `status='processed'` for: (a) actual push success, (b) no tokens, (c) dedup skip, (d) prefs opt-out, (e) stale/terminal skip, (f) push provider missing. From the queue table alone we cannot tell if a push actually went out. No `delivered_count` / `failed_count` columns recorded per item.

### Gap 3 — Bell badge may over-shout in seller mode
Seller mode now counts ALL notifications (buyer + seller). Demo_seller has 30 unread → badge shows "30". Expected, but may overwhelm. No filter for "buyer-only types in seller mode" (e.g. `delivery_proximity` for the seller's own buyer purchases would still count).

### Gap 4 — `useLatestActionNotification` toast may surface seller-targeted notifs to a buyer-mode user
Function uses same role split → OK in theory, but `not('data', 'is', null)` will skip notifications where data is `{}`. Trigger writes `data={}` only when payload is also empty, so probably fine, but unverified.

### Gap 5 — RichNotificationCard action routing
Cards depend on `payload.action`. DB rows from `process-notification-queue` only set `payload.action` if the upstream caller provided it. Most `order` notifications do NOT include `action` in payload → cards render as plain rows (correct behavior, but worth confirming the inbox is now usable).

### Gap 6 — No realtime subscription for new notifications
Bell + inbox refetch every 60s only. Push tap → app open → notification not visible until next poll. Acceptable but worth flagging.

### Gap 7 — `process-notification-queue` writes only `payload` + `reference_path` to `user_notifications`
The trigger handles the mirror, so technically fine. But if the trigger is ever dropped, we silently regress. Defense-in-depth: edge function should write both columns.

---

## Implementation Plan

### Step A — End-to-end push verification (highest value)
1. From the seller user's session, call the diagnostic edge function `notification-diagnostics` and confirm device tokens + queue health.
2. Insert a synthetic `notification_queue` row via SQL (status='pending', target_role='seller', valid order id from this user) and manually invoke `process-notification-queue` via curl.
3. Inspect the new edge function logs for `[Queue][...]`, `push_delivery`, `push_priority` events. Confirm one of: (a) APNs 200, (b) FCM 200, (c) clear failure with credential error.
4. If credentials fail to load → fix `getCredential` lookup keys in `system_settings` / Supabase secrets.

### Step B — Add explicit delivery telemetry to queue
Add columns to `notification_queue`:
- `push_attempted boolean default false`
- `push_success_count int default 0`
- `push_fail_count int default 0`
- `push_skip_reason text` (e.g. `dedup`, `stale`, `silent`, `no_tokens`, `prefs_opt_out`, `no_credentials`)

Update edge function to populate these — gives ops a single SELECT to see what happened.

### Step C — Defense-in-depth in edge function
Update all 5 `INSERT INTO user_notifications` sites in `process-notification-queue/index.ts` to include BOTH `payload`+`data` and BOTH `reference_path`+`action_url` (trigger still mirrors, but explicit is safer).

### Step D — Refine seller-mode bell badge
In `useUnreadNotificationCount` seller mode, exclude pure-buyer types so the badge means "things needing seller attention":
```ts
// In seller mode, hide pure-buyer notification types from the badge
if (isSeller) {
  q = q.not('type', 'in', '(delivery_proximity,delivery_proximity_imminent,delivery_en_route,buyer_otp)');
}
```
Inbox keeps showing everything; only the badge gets calmer.

### Step E — Realtime subscription (optional polish)
In `PushNotificationProvider`, subscribe to `user_notifications` INSERT for `user_id=auth.uid()` and invalidate the `unread-notifications` + `notifications` queries on each insert. This makes the bell react in <1s instead of up to 60s.

### Step F — Self-healing `data` shape
Update `wrapNotification` to coerce `data` to `{}` when null AND surface a stable `data` shape so downstream `data?.action` etc. never throws.

### Step G — Verification checklist (after fixes)
1. Place a real test order from a buyer account → seller bell increments within 60s.
2. Tap a seller notification → deep-links to `/seller/orders/:id` (was broken before mirror).
3. `notification_queue` row shows `push_attempted=true`, `push_success_count >= 1`.
4. Device receives APNs/FCM (visible in iOS notification center).
5. Buyer-mode bell on Demo_seller filters out the seller order — shows only buyer-relevant unread.

---

## Files to Change

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Add 4 telemetry columns to `notification_queue` |
| `supabase/functions/process-notification-queue/index.ts` | Populate telemetry columns, write both column-pairs in inserts (defense-in-depth) |
| `src/hooks/queries/useNotifications.ts` | Coerce `data` to `{}` in `wrapNotification` |
| `src/hooks/useUnreadNotificationCount.ts` | Exclude pure-buyer types in seller mode |
| `src/components/notifications/PushNotificationProvider.tsx` | Realtime subscription → invalidate bell + inbox on INSERT |

Steps A and G are runtime verification, not code changes.

---

## Bottom Line

**Inbox + bell + role filtering: fixed and confirmed in console.**
**Push delivery: code path looks correct, but we have ZERO real-world evidence of a successful push since the fix because no orders have been placed.**
**The fixes are NOT bulletproof until Step A (live end-to-end test) passes and Step B (telemetry) gives us per-item visibility.**

