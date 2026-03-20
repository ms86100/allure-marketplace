

# Fix: Type Mismatch in Notification Trigger Crashing Order Updates

## Root Cause

The database error log reveals the exact problem:

```
WARNING: fn_enqueue_order_status_notification failed for order f1d7cdc1-...:
  operator does not exist: service_category = text
```

The migration we just deployed (`20260320093032`) introduced a join in the notification trigger:

```sql
JOIN public.category_config cc ON cc.category = p.category
```

`category_config.category` is type `service_category` (enum), while `products.category` is type `text`. PostgreSQL cannot compare an enum to text without an explicit cast. This causes the trigger to fail on **every** order status update.

While the trigger has `EXCEPTION WHEN OTHERS THEN RETURN NEW` (so the UPDATE itself succeeds at the DB level), the `v_listing_type` variable remains NULL, which means `v_transaction_type` falls through to `'self_fulfillment'` instead of the correct type. This causes the flow lookup to find no matching `notification_title`, so the trigger exits early without enqueuing any notification and — critically — without cleaning up `live_activity_tokens` for terminal states.

The order itself (`f1d7cdc1`) ended up `cancelled` by the 3-minute auto-cancel timer, confirming the seller likely tried to accept but the UI may not have reflected the update (no notification queued → no push → no live activity sync).

## Fix

**One SQL migration** — cast `p.category` to `service_category` in the trigger's join:

**File**: New SQL migration

Change line 58 of the trigger function from:
```sql
JOIN public.category_config cc ON cc.category = p.category
```
to:
```sql
JOIN public.category_config cc ON cc.category = p.category::service_category
```

This is a single-line fix that resolves the type mismatch and restores correct `transaction_type` resolution for all order status notifications.

## Impact

| Before Fix | After Fix |
|-----------|-----------|
| Trigger fails silently on every status change | Trigger resolves transaction_type correctly |
| No push notifications sent for any order | Push notifications sent per flow config |
| live_activity_tokens not cleaned on terminal | Terminal cleanup works |
| Seller/buyer don't get real-time push updates | Full notification pipeline restored |

