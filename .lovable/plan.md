

## Fix: Store Approval Notifications Not Delivered

### Root Cause

The investigation reveals a **race condition in the notification trigger** combined with a **missing cron safety net**:

1. When admin approves a store, `notifySellerStatusChange()` inserts into `notification_queue` — this part works correctly (confirmed: row `8ceb507c` was created at 05:57:43 with status `pending`).

2. The `trg_process_notification_queue_realtime` trigger fires `pg_net.http_post` to invoke the `process-notification-queue` edge function. The edge function boots and calls `claim_notification_queue` RPC.

3. **The race condition**: `pg_net.http_post` schedules the HTTP call, but the edge function can arrive and query the table *before the INSERT transaction commits*. The `claim_notification_queue` finds 0 pending items and returns. The row then commits and sits as `pending` forever.

4. **No cron fallback exists**: There is no periodic cron job to sweep `notification_queue` for stuck `pending` items. Every other periodic task (bookings, reminders, stalled deliveries) has a cron, but notification queue processing does not. This means any item missed by the trigger is never retried.

Evidence from the database:
- The latest seller_approved notification (`8ceb507c`, created 05:57:43) is still `pending` with no `processed_at` — the trigger-invoked edge function missed it
- Older notifications eventually got processed only because subsequent unrelated INSERT triggers happened to pick them up as a side effect
- No `user_notifications` row exists for this latest approval

### Fix Plan

**Step 1: Add a cron job for notification queue processing**

Create a migration to add a `pg_cron` job that invokes `process-notification-queue` every minute. This ensures any items missed by the trigger are processed within 60 seconds at most.

```sql
SELECT cron.schedule(
  'process-notification-queue-sweep',
  '* * * * *',  -- every minute
  $$ SELECT net.http_post(
    url := 'https://ywhlqsgvbkvcvqlsniad.supabase.co/functions/v1/process-notification-queue',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  ) $$
);
```

**Step 2: Add a small delay in the trigger function**

Modify `trigger_process_notification_queue` to use `pg_sleep(0.5)` before the `pg_net.http_post` call, giving the INSERT transaction time to commit before the edge function queries. This improves the trigger's hit rate without relying solely on the cron.

**Step 3: Retry stuck items**

Also add a cron (every 5 min) or extend the existing sweep to also handle items stuck in `processing` for >2 minutes (edge function crash recovery), resetting them to `pending`.

### Files Changed

1. **Database migration** — Add cron job + update trigger function with delay
2. No client-side changes needed — the enqueue logic and edge function are correct; the issue is purely the delivery pipeline timing

### Why This Fixes It

- The cron job guarantees every `pending` item is processed within 60 seconds, regardless of trigger race conditions
- The trigger delay improves instant delivery success rate
- Together they provide the same reliability pattern used by order status notifications (which work because they're triggered by a different, more frequent flow)

