

# Round 3 Audit: Workflow-Driven Notification System

## Verdict: 1 Critical Bug, 1 Minor Cleanup

---

## Fully Working (No Issues)

| Area | Status |
|---|---|
| Workflow-driven DB trigger (buyer side) | Working |
| Admin UI — buyer + seller notification config | Working |
| Notification queue pipeline + payload passthrough | Working |
| RichNotificationCard + HomeNotificationBanner | Working |
| NotificationInboxPage (rich cards for actions) | Working |
| Push notification with action data | Working |
| Booking reminders (cron-based) | Working |
| Retry / dead-letter / dedup | Working |
| Security (RLS, SECURITY DEFINER) | Working |
| Icon type matching (`order` + `order_status`) | Working |
| Fallback to `default` parent_group | Working |
| `{seller_name}` placeholder substitution | Working |

---

## BUG (Critical): Seller notifications go to wrong user_id

The trigger inserts `NEW.seller_id` directly as `user_id` in `notification_queue` (line 98 of the migration). But `orders.seller_id` references `seller_profiles.id` — NOT `auth.users.id`.

Result: seller notifications are inserted with a seller_profile UUID as the user_id. Since RLS on `user_notifications` filters by `auth.uid()`, these notifications are **invisible to everyone**. They exist in the DB but no seller will ever see them.

**Fix**: The trigger must look up `seller_profiles.user_id` (the actual auth user UUID) and use that instead. The trigger already fetches from `seller_profiles` for the business name — just also grab `user_id` in the same query.

```sql
-- Current (broken):
INSERT INTO notification_queue (user_id, ...) VALUES (NEW.seller_id, ...);

-- Fix: use the seller's auth user_id
DECLARE v_seller_user_id uuid;
-- In the existing SELECT that gets business_name:
SELECT sp.business_name, sp.user_id, COALESCE(sp.primary_group, 'default')
INTO v_seller_name, v_seller_user_id, v_parent_group
FROM seller_profiles sp WHERE sp.id = NEW.seller_id;

-- Then use v_seller_user_id in the insert:
INSERT INTO notification_queue (user_id, ...) VALUES (v_seller_user_id, ...);
```

---

## Minor: Stale file `src/lib/order-notification-titles.ts`

Still exists with hardcoded maps. Only referenced from `src/test/helpers/business-rules.ts`. Not used in production code — maintenance hazard only. Can be cleaned up by removing the file and updating the test helper.

---

## Implementation Plan

### Step 1: Database migration
Replace `fn_enqueue_order_status_notification` — add `v_seller_user_id` variable, fetch `sp.user_id` alongside `sp.business_name`, use `v_seller_user_id` instead of `NEW.seller_id` in the seller notification insert.

### Step 2: (Optional) Delete stale file
Remove `src/lib/order-notification-titles.ts` and update `src/test/helpers/business-rules.ts` to remove the import.

### Files changed
- Database migration (1 file — trigger replacement)
- `src/lib/order-notification-titles.ts` (delete)
- `src/test/helpers/business-rules.ts` (remove stale import)

