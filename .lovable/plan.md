

# Audit Report: Workflow-Driven Notification System

## What IS Implemented (Working)

1. **Workflow-driven DB trigger** — `fn_enqueue_order_status_notification` dynamically reads `notify_buyer`, `notification_title`, `notification_body`, `notification_action` from `category_status_flows`. No hardcoded statuses. Includes `{seller_name}` placeholder substitution and fallback to `default` parent_group.

2. **Admin Workflow Editor** — Toggle, title, body, and action fields per step. Saves correctly to DB.

3. **Notification queue pipeline** — Trigger inserts into `notification_queue` → `pg_net` trigger invokes `process-notification-queue` edge function instantly → copies to `user_notifications` + sends push notification. Deduplication via `queue_item_id`.

4. **Booking reminders** — `send-booking-reminders` edge function runs via cron, sends 1-hour-before reminders. Works independently of workflow engine (appropriate — reminders are time-based, not status-based).

5. **Backfill** — All 17 previously hardcoded notification messages migrated to `category_status_flows` table rows.

---

## Gaps Found

### GAP-1: `notification_action` is lost in the pipeline (P1)

The DB trigger stores `action` in `notification_queue.payload` as JSON, but `process-notification-queue` (line 69-78) **never copies the payload** to `user_notifications`. The `user_notifications` table likely doesn't even have a `payload` or `action` column.

**Impact**: Action buttons configured by admins (e.g. "Rate Order") are stored but never reach the frontend.

**Fix**: Add a `payload` (jsonb) column to `user_notifications`. Update `process-notification-queue` to copy `item.payload` into the insert. Update `useNotifications` query to include `payload`.

### GAP-2: No rich "Blinkit-style" notification card in the in-app inbox (P1)

`NotificationInboxPage.tsx` renders a plain list of small items with a Bell icon, title, body, and timestamp. There is:
- No large card layout
- No action button ("Rate Order", "Open Order")
- No illustration/icon from the workflow config
- No visual distinction for important terminal notifications

**Impact**: The "Blinkit-style rich notification" from the user's request is completely missing from the frontend.

**Fix**: Create a `RichNotificationCard` component that renders important notifications (those with an action in payload) as large cards with icon, bold title, message, and an action button. Use this in NotificationInboxPage and optionally as a home-screen overlay for the most recent unread important notification.

### GAP-3: No home-screen notification banner/overlay (P2)

The user specifically requested "large home-screen notifications" similar to Blinkit (the uploaded image shows a big overlay card on the home screen). Currently, there is no such component — notifications only appear in the inbox page and as push notifications.

**Fix**: Create a `HomeNotificationBanner` component that shows the latest unread notification with an action button as a prominent card on the home screen. Auto-dismiss after a few seconds or on tap.

### GAP-4: Push notification payload doesn't include `notification_action` for deep linking (P2)

The `send-push-notification` edge function sends title + body but the action button context (e.g. navigate to rating page) is not included in the push payload's `data` field for the mobile app to handle.

**Fix**: Pass `payload.action` from `notification_queue` through to the push notification `data` field so the native app can handle action-specific deep linking on tap.

### GAP-5: Booking reminders use hardcoded title/body (P3 — Informational)

`send-booking-reminders` uses `"⏰ Appointment in 1 hour"` — not configurable from the workflow editor. This is acceptable because reminders are time-triggered, not status-triggered. The workflow engine handles status changes; cron handles time-based reminders. No fix needed.

---

## Implementation Plan

### Step 1: Database migration
- Add `payload jsonb` column to `user_notifications` table

### Step 2: Update `process-notification-queue` edge function
- Copy `item.payload` into the `user_notifications` insert
- Pass `payload.action` to `send-push-notification` call's data field

### Step 3: Update `useNotifications` hook
- Include `payload` in the select query
- Type the payload interface

### Step 4: Create `RichNotificationCard` component
- Large card with icon, bold title, body text, and action button
- Action button navigates based on payload (e.g. "Rate Order" → `/orders/{orderId}?action=rate`)
- Used for notifications that have a `payload.action` value

### Step 5: Update `NotificationInboxPage`
- Render notifications with actions using `RichNotificationCard`
- Keep simple layout for standard notifications

### Step 6: Create `HomeNotificationBanner`
- Overlay component on home screen showing latest important unread notification
- Shows as a large dismissible card with action button
- Auto-fetches latest unread notification with action on mount
- Dismisses on tap or after timeout

### Files to change:
- `supabase/functions/process-notification-queue/index.ts` — pass payload through
- `src/hooks/queries/useNotifications.ts` — add payload to query
- `src/pages/NotificationInboxPage.tsx` — render rich cards for action notifications
- **New**: `src/components/notifications/RichNotificationCard.tsx`
- **New**: `src/components/notifications/HomeNotificationBanner.tsx`
- Home page component — mount `HomeNotificationBanner`
- Database migration for `user_notifications.payload`

