

# Zero-Cron Real-Time Failure Audit — Results

## Audit Summary Table

| Component | Real-time? | Cron dep? | Polling dep? | Silent failure? | Status |
|-----------|-----------|-----------|-------------|----------------|--------|
| Push trigger (INSERT → edge fn) | Yes | No | No | No (has EXCEPTION) | PASS |
| Push retries (status=retrying) | No | **YES** | No | **YES** | **FAIL** |
| Live Activity (realtime sub) | Yes | No | No | No | PASS |
| Live Activity (app resume sync) | Yes (one-shot) | No | No | No | PASS |
| Cron job (20260302 migration) | N/A | **YES** | N/A | **YES** (wrong URL) | **FAIL** |
| `useLiveActivity.ts` hook | N/A | No | No | No | Dead code |

---

## CRITICAL FAILURE: Orphaned Push Retries

### Root Cause
The edge function `process-notification-queue` has a retry mechanism: when push delivery fails (APNs/FCM error), it sets the queue item to `status = 'retrying'` with `next_retry_at` (exponential backoff: 30s, 2min, 8min).

However, `trg_process_notification_queue_realtime` fires on `AFTER INSERT` only. When an item is UPDATEd to `retrying`, nothing re-invokes the edge function. The cron job was the only thing that would pick these up — and we just removed it.

**Result:** If a push notification fails on first attempt (APNs timeout, FCM error, device token expired), it is permanently orphaned. The in-app notification is saved (idempotent INSERT), but the device push is never retried. This is a silent failure with no visibility.

### Fix
Two options, both real-time:

**Option A (Recommended): Inline retry in edge function.** Instead of setting `status = 'retrying'` and hoping something re-invokes later, retry immediately within the same edge function invocation using `await new Promise(r => setTimeout(r, delay))` with max 2 retries and short delays (2s, 5s). This keeps everything in the single trigger→edge function invocation.

**Option B: Self-invoking edge function.** After setting items to `retrying`, the edge function schedules a delayed self-invocation via `net.http_post` with a delay header. More complex, same result.

### Changes for Option A

| File | Change |
|------|--------|
| `supabase/functions/process-notification-queue/index.ts` | Replace the retry-to-DB logic (lines 167-179) with inline retry: attempt push up to 3 times with 2s/5s delays within the same invocation. On final failure, mark as `failed` (dead-letter). Remove `retrying` status entirely. |
| `supabase/migrations/new` | Update `claim_notification_queue` to remove the `OR (status = 'retrying' ...)` clause since retries now happen inline. |

---

## PASS: Cron Job Already Removed

Migration `20260318101405` runs `SELECT cron.unschedule('process-notification-queue')`. However, the original migration `20260302181927` that creates it still exists in the migration chain. The unschedule should have executed. The edge function logs confirm it's still being invoked every ~60s (boot→shutdown pattern visible in logs). This means the unschedule migration **may not have run yet** or failed.

### Fix
Verify cron was actually unscheduled. If logs still show periodic invocations after migration ran, create a new migration that explicitly drops it again and also drops the cron function reference.

---

## PASS: Live Activity Pipeline

- Realtime subscriptions on `orders` (UPDATE) and `delivery_assignments` (INSERT+UPDATE) are correctly wired
- No polling fallback exists (removed in previous commit)
- App-resume one-shot sync via `syncActiveOrders` is correct (not polling, fires once)
- Deduplication via Swift native check + JS `starting` set + hydration lock is correct
- `en_route` missing from `ACTIVE_STATUSES` but `arrived` was added — matches DB enum

---

## Dead Code: `useLiveActivity.ts`

Not imported anywhere. Safe to delete.

---

## Summary of Required Changes

| # | File | Change | Severity |
|---|------|--------|----------|
| 1 | `supabase/functions/process-notification-queue/index.ts` | Replace retry-to-DB with inline retry (3 attempts, 2s/5s delays). Remove `retrying` status usage. Dead-letter on final failure. | Critical |
| 2 | New migration SQL | Simplify `claim_notification_queue` to only select `status = 'pending'` (remove retrying clause). Also re-run `cron.unschedule` as safety net. | Critical |
| 3 | `src/hooks/useLiveActivity.ts` | Delete file (dead code, never imported) | Low |

### What This Achieves
- Push notification retries happen **inline** in the same edge function invocation — no cron, no polling, no orphaned items
- System works identically with all cron jobs disabled
- Failed pushes are dead-lettered with full error visibility in `notification_queue.last_error`
- Zero silent degradation

