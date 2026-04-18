

# Notification System — Root Cause Analysis & Fix Plan

## What I Found (Evidence from DB + Code)

The user `6b7d338f` (Demo_seller) has **31 unread notifications in DB**, but the inbox shows **"No notifications yet"** (per session replay), the bell shows **0**, and **no push notifications** are being delivered. There are **three independent bugs** working together.

### Bug 1 — Schema Drift: Two Columns That Should Be One (`payload` vs `data`, `reference_path` vs `action_url`)

The `user_notifications` table has BOTH `payload` AND `data`, BOTH `reference_path` AND `action_url`. The edge function `process-notification-queue` writes to `payload` + `reference_path`. The client (`useNotifications.ts`) reads ONLY `data` + `action_url`.

Evidence — DB row `8bf7d438`:
```
payload: { order_id, buyer_name, total, ... }   ← edge function wrote here
data: {}                                         ← client reads from here (empty)
reference_path: "/seller/orders/dfff..."         ← edge function wrote here
action_url: null                                 ← client reads from here (null)
```
Result: every notification looks "actionless" to the client. `RichNotificationCard` never renders, deep-linking never works.

### Bug 2 — Inbox Filter Hides ALL of This User's Notifications

`useNotifications` has two filters:
1. `not('type', 'in', '(settlement, seller_approved, ..., product_approved, ...)')` — fine
2. `not('data->>target_role', 'eq', 'seller')` — checks `data` (empty `{}`) so passes
3. **Missing filter**: But `useUnreadNotificationCount` ALSO filters seller-only types

User's 31 unread breakdown:
- 17 × `order` (seller "New Order Received") → both `payload.type='purchase'` and `reference_path='/seller/...'` indicate seller-targeted, but no filter catches them
- 8 × `moderation` → seller-only, **not** in SELLER_ONLY_TYPES filter
- 5 × `order_status` → mixed buyer/seller (payload.target_role='seller' but stored in `payload`, not `data`, so filter misses it)
- 1 × `seller_daily_summary` → seller-only, **not** in SELLER_ONLY_TYPES filter

**However** — the session replay shows the inbox renders empty. The likely cause: the inbox query selects `data` (empty) but a downstream `.map` or render path crashes silently, OR — checking the session log timestamp `[1776496509607]` — the page actually rendered "No notifications yet" because `notifications.length === 0`. 

Most likely: the row shape returned has `data: {}` but the wrapper expects `data: null` and one of the downstream `.payload?.action` accesses works, but **the query may be failing silently due to RLS** OR the React Query is returning empty pages because pagination cursor is wrong with `created_at` strings. Need to confirm via console at runtime, but the schema mismatch is the dominant root cause regardless.

### Bug 3 — Push Notifications Never Sent (0 in last 24h)

`notification_queue.status='sent'` count in last 24h = **0**. All recent rows have `status='processed'` not `'sent'`. The edge function writes the in-app notification then marks the queue row `processed`, but per code at lines 514-520 silent_push paths skip device delivery; for non-silent the FCM/APNs send happens later in the file. With 0 sent in 24h while orders are flowing, push delivery is broken — likely:
- No FCM/APNs credentials loaded (logs show "credentials loaded" never printed in recent boots)
- OR all recent items hit the dedup/stale guard

Also: **the user has 2 device_tokens but no pushes are being sent**, suggesting the push delivery branch is being skipped entirely.

### Bug 4 — Bell Count Filter Is Wrong For This User

`useUnreadNotificationCount` filters `data->>target_role='seller'` but the seller-targeted notifications store `target_role` in `payload`, not `data`. So bell shows 0 for buyers (good) but **also** 0 for sellers (bad — they should see seller notifications when in seller mode).

Conceptual issue: the app currently treats "seller" notifications as second-class — filtering them out for buyer-mode but never showing them in seller-mode either. There's no role-aware bell.

---

## Fix Plan

### Step 1 — Unify `payload`/`data` and `reference_path`/`action_url` (root cause for everything)

Add a DB trigger that mirrors writes both ways, so legacy code keeps working:
```sql
CREATE OR REPLACE FUNCTION sync_notification_columns()
RETURNS trigger AS $$
BEGIN
  -- Mirror payload ↔ data
  IF NEW.payload IS NOT NULL AND (NEW.data IS NULL OR NEW.data = '{}'::jsonb) THEN
    NEW.data := NEW.payload;
  ELSIF NEW.data IS NOT NULL AND (NEW.payload IS NULL OR NEW.payload = '{}'::jsonb) THEN
    NEW.payload := NEW.data;
  END IF;
  -- Mirror reference_path ↔ action_url
  IF NEW.reference_path IS NOT NULL AND NEW.action_url IS NULL THEN
    NEW.action_url := NEW.reference_path;
  ELSIF NEW.action_url IS NOT NULL AND NEW.reference_path IS NULL THEN
    NEW.reference_path := NEW.action_url;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_notification_columns
  BEFORE INSERT OR UPDATE ON user_notifications
  FOR EACH ROW EXECUTE FUNCTION sync_notification_columns();
```

Plus a one-time backfill for the existing 31 rows:
```sql
UPDATE user_notifications
SET data = COALESCE(NULLIF(data, '{}'::jsonb), payload),
    action_url = COALESCE(action_url, reference_path)
WHERE (data = '{}'::jsonb OR data IS NULL) AND payload IS NOT NULL;
```

### Step 2 — Fix Inbox + Bell Filters (role-aware)

In `useNotifications.ts` and `useUnreadNotificationCount.ts`:
- Check BOTH `data->>target_role` AND `payload->>target_role`
- Add `moderation`, `seller_daily_summary` to `SELLER_ONLY_TYPES`
- Make the buyer/seller split based on the user's CURRENT role context (using existing role hook), so:
  - In buyer mode → hide rows with `target_role='seller'` OR seller-only types
  - In seller mode → show seller rows, hide pure-buyer rows

This way the Demo_seller user actually sees their 31 seller notifications when on `/seller/...` routes.

### Step 3 — Fix Push Delivery (notification_queue → device)

Investigate why `notification_queue.status='sent'` is 0:
- Read full `process-notification-queue/index.ts` lines 520-624 (the actual FCM/APNs send path)
- Check if `creds.apnsConfigured` and FCM are actually loaded  
- Check `system_settings` for required keys (`monitor-stalled-deliveries` already logs "Failed to parse transit_statuses from system_settings" — same pattern likely)
- Add structured logging at every branch so we know which path each item took
- Verify the cron that invokes `process-notification-queue` is actually firing on order events (currently every ~1 min based on logs, but always finds "no pending" — meaning either no rows are in `pending` status OR the trigger fires before cron picks them up)

### Step 4 — Fix Inbox Empty-State Bug

Current symptom: 31 unread but inbox shows empty. Likely the React Query is firing fine, but with `data: {}` and seller rows getting filtered, after applying Step 2 fixes verify inbox now shows them. Add an `[Inbox] fetched N notifications` console log to confirm.

### Step 5 — Add a 5-Item Diagnostic Endpoint

New edge function `notification-diagnostics` that returns for the calling user:
- `unread_count` from DB
- `device_tokens_count` and platforms
- `last_5_queued` (status + last_error)
- `last_5_delivered` to user_notifications
- `notification_preferences` row

This gives us (and the user) a single spot to verify health.

---

## Files to Change

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Add `sync_notification_columns` trigger + backfill UPDATE + add to SELLER_ONLY_TYPES list (no — that's client) |
| `src/hooks/queries/useNotifications.ts` | Read from both `data` and `payload`; check `payload->>target_role`; add `moderation`, `seller_daily_summary` to filter; role-aware filtering |
| `src/hooks/useUnreadNotificationCount.ts` | Same role-aware + payload/data filtering |
| `supabase/functions/process-notification-queue/index.ts` | Add detailed branch logging; ensure both `data` AND `payload` written (defense in depth even with trigger) |
| `supabase/functions/notification-diagnostics/index.ts` | NEW — diagnostic endpoint |

## What I'll Verify After Fix

1. Inbox shows the 31 existing notifications for Demo_seller
2. Bell counter shows correct unread number based on current role
3. Place a new test order → `notification_queue` row goes `pending → sent` (not just `processed`)
4. Tapping a seller notification deep-links to `/seller/orders/:id`
5. Push notification arrives on the registered device (verify via `device_tokens` user)

