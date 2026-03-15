

# Round 2 Audit: Workflow-Driven Notification System

## Verdict: Mostly Complete — 4 Issues Found (2 bugs, 2 gaps)

---

## Implemented and Working

1. **Workflow-driven DB trigger** — `fn_enqueue_order_status_notification` reads `notify_buyer`, `notification_title`, `notification_body`, `notification_action` from `category_status_flows`. Fallback to `default` parent_group. `{seller_name}` placeholder substitution. No hardcoded statuses.

2. **Admin Workflow Editor** — Toggle + title/body/action fields per step. Saves and loads correctly. All 4 notification columns fetched in `loadWorkflows()` and persisted in `saveWorkflow()`.

3. **Notification queue pipeline** — Trigger inserts to `notification_queue` → `pg_net` instantly invokes `process-notification-queue` → inserts to `user_notifications` with `payload` (including `action`) → sends push with `data` payload. Deduplication via `queue_item_id`.

4. **Rich notification UI** — `RichNotificationCard` renders large card with icon, title, body, action button. `HomeNotificationBanner` shows latest unread action notification on home screen. `NotificationInboxPage` renders rich cards for action-bearing notifications.

5. **Booking reminders** — `send-booking-reminders` edge function handles 1-hour-before cron reminders. Independent of workflow engine (appropriate).

6. **Queueing, retries, dead-lettering** — `claim_notification_queue` atomic batch claim, exponential backoff retries, max 3 attempts, `queue_item_id` dedup.

7. **Security** — Trigger uses `SECURITY DEFINER`. Queue processes via service-role key. RLS on `user_notifications` ensures users only see their own.

---

## Issues Found

### BUG-1: Notification type mismatch — icon always shows default (P2)

The DB trigger inserts `type: 'order'` (migration line 174: `NEW.buyer_id, 'order', v_title, ...`). But `RichNotificationCard.getIcon()` checks for `'order_status'`, not `'order'`. The icon will always fall through to the `default` case (generic Bell icon) instead of showing the Package icon for orders.

**Fix**: Change the trigger to insert `'order_status'` instead of `'order'`, OR update `getIcon()` to match on `'order'`.

### BUG-2: Stale hardcoded title map still exists (P3 — low risk)

`src/lib/order-notification-titles.ts` still contains the old hardcoded `ORDER_NOTIF_TITLES_BUYER` and `ORDER_NOTIF_TITLES_SELLER` maps. If any code still references `getOrderNotifTitle()`, it would use stale data instead of the workflow-configured values. This is a maintenance hazard.

**Fix**: Search for usages. If no code references it, delete the file. If referenced, replace with a DB lookup or remove the references.

### GAP-1: Seller notifications are not workflow-driven (P2)

The trigger only sends buyer notifications (`notify_buyer`). There is no `notify_seller` column or equivalent logic. Seller notifications for statuses like `placed`, `enquired`, `requested` are no longer being sent (the old hardcoded CASE block was replaced). The `ORDER_NOTIF_TITLES_SELLER` map in the stale file confirms these were previously sent.

**Fix**: Either add `notify_seller`, `seller_notification_title`, `seller_notification_body` columns to `category_status_flows` and extend the trigger, OR handle seller notifications separately. This is a **functional regression** — sellers may not be receiving "New Order Received!" notifications.

### GAP-2: Backfill UPDATEs lack parent_group/transaction_type scoping (P3)

The backfill migration updates by `status_key` alone (e.g., `WHERE status_key = 'completed'`), which sets notification config on ALL workflows that have that status key. If a `completed` step in one workflow should have a different message than another, they'd all get the same text. Not a current bug (all share the same messages now), but could cause confusion if workflows diverge.

**Fix**: No immediate action needed — just awareness for future.

---

## Summary

| Area | Status |
|---|---|
| Workflow-driven trigger | Working |
| Admin UI config | Working |
| Queue pipeline + payload passthrough | Working |
| Rich notification card | Working |
| Home screen banner | Working |
| Notification inbox (rich cards) | Working |
| Push notification with action data | Working |
| Booking reminders | Working (independent) |
| Retry/dead-letter | Working |
| Security | Working |
| Icon type mismatch | **Bug — fix needed** |
| Seller notifications | **Regression — not sent** |
| Stale hardcoded title map | **Cleanup needed** |

## Recommended Fixes (Priority Order)

1. **Fix seller notification regression** — Add `notify_seller` + seller notification fields to `category_status_flows` and extend the trigger to also notify sellers. This is the most impactful gap.
2. **Fix type mismatch** — Change trigger `'order'` → `'order_status'` so icons render correctly.
3. **Delete stale file** — Remove `src/lib/order-notification-titles.ts` if unused, or remove references to it.

