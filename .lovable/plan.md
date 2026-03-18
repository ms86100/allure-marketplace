

# Real-Time Audit: Push Notifications + Live Activities

## PHASE 1: Push Notification Pipeline — Current Flow

```text
order.status UPDATE
  → DB trigger: fn_enqueue_order_status_notification()
    → INSERT into notification_queue
      → DB trigger: trg_process_notification_queue_realtime
        → net.http_post → process-notification-queue edge function
          → send-push-notification edge function
            → APNs/FCM → device
```

**Verdict: The trigger chain IS real-time.** The latest migration (20260318100701) hardcoded the correct URL and anon key. However:

### Issue 1: Trigger function missing EXCEPTION handler
The latest `trigger_process_notification_queue` (migration 20260318100701) **dropped** the `EXCEPTION WHEN OTHERS` block that existed in the original (20260312190128). If `net.http_post` fails (DNS, timeout), the entire `notification_queue` INSERT transaction rolls back — the notification is **lost**, not just delayed.

**Fix:** Re-create with `EXCEPTION WHEN OTHERS THEN RETURN NEW` and restore `SET search_path TO 'public'`.

### Issue 2: Cron job still exists (wrong URL)
Migration 20260302181927 schedules a cron job pointing to `rvvctaikytfeyzkwoqxg` (wrong project) with `current_setting('app.settings.service_role_key', true)` (returns NULL). This cron job fires every minute doing nothing useful — wasted edge function invocations visible in logs (boot → shutdown every 60s with no processing).

**Fix:** Unschedule the cron job entirely. The realtime trigger is the single path.

---

## PHASE 2: Cron Dependency Analysis

| Cron Job | Purpose | What breaks if removed? | Can realtime replace? |
|----------|---------|------------------------|----------------------|
| `process-notification-queue` (every 1m) | Safety net for missed trigger | Nothing — trigger is the real path. Cron currently calls wrong URL anyway | Yes — trigger handles it |

**Verdict:** The cron job is dead code. It calls a non-existent project. Removing it changes nothing functionally but stops wasting edge function cold boots.

**Additional cron jobs** (booking reminders, slot generation, trust scores) are legitimate scheduled tasks, not notification-related. They stay.

---

## PHASE 3: Live Activity Real-Time Sync

### Current architecture has TWO paths:
1. **Realtime subscriptions** (correct): `orders` UPDATE + `delivery_assignments` INSERT/UPDATE → orchestrator → `LiveActivityManager.push()`
2. **15-second polling fallback** (lines 207-215 of orchestrator): `setInterval(doSync, 15_000)`

### Issue 3: Polling fallback masks realtime failures
The 15s poll in `useLiveActivityOrchestrator.ts` means if realtime breaks, the system silently degrades to 15s-delayed updates instead of failing fast. Per the audit requirement: if polling is required for correctness, architecture is wrong.

**Analysis:** The realtime subscriptions on `orders` and `delivery_assignments` are correctly configured. The only scenario where realtime fails is channel degradation (network issues). In that case:
- Without polling: activity updates stop until network recovers (acceptable — matches user's "fail fast" requirement)
- With polling: updates are delayed 15s (masks the failure)

**Fix:** Remove the polling fallback entirely. The realtime channel `CHANNEL_ERROR`/`TIMED_OUT` handler should attempt reconnection, not fall back to polling.

### Issue 4: `en_route` missing from `ACTIVE_STATUSES`
`liveActivitySync.ts` line 12-13: `ACTIVE_STATUSES` is missing `'en_route'`. This only matters for the sync function (used by polling and app-resume). Since we're removing polling, this only affects app-resume rehydration.

**Fix:** Add `'en_route'` to `ACTIVE_STATUSES`.

---

## PHASE 4: Deduplication — PASS

Already verified in previous audit:
- **Swift native:** Iterates `Activity<LiveDeliveryAttributes>.activities` by entityId before `Activity.request()` — prevents native duplicates
- **JS `starting` Set:** Prevents concurrent `startLiveActivity` calls
- **Promise-based hydration lock:** All concurrent `push()` calls share one hydration promise
- **No `end()` on navigation:** Fixed in previous commit (removed cleanup effect from `useLiveActivity.ts`)

---

## PHASE 5: Race Conditions — PASS with one caveat

- **Rapid status updates:** 5s throttle in `LiveActivityManager` coalesces updates
- **App resume:** `resetHydration()` + `doSync()` — currently pauses poll timer during resume (poll removal eliminates this race entirely)
- **`syncing` mutex:** Prevents concurrent `syncActiveOrders` calls

**Caveat:** After removing polling, the app-resume rehydration via `syncActiveOrders` should remain — it's a one-shot reconciliation, not polling.

---

## PHASE 6: Failure Modes

| Failure | Current Behavior | Required Behavior |
|---------|-----------------|-------------------|
| `net.http_post` fails in trigger | Transaction rolls back, notification LOST | Must catch exception, notification saved, push delivery fails gracefully |
| Edge function fails | Retry with exponential backoff (3 attempts) | Acceptable — retries are per-item, not cron-based |
| Realtime channel drops | Polling picks up in 15s | Activity updates pause until reconnect; app-resume rehydrates |

---

## Summary of Changes

| # | Type | Change | Impact |
|---|------|--------|--------|
| 1 | Migration SQL | Re-create `trigger_process_notification_queue` with `EXCEPTION WHEN OTHERS` and `SET search_path` | Prevents notification loss on HTTP failure |
| 2 | Migration SQL | `SELECT cron.unschedule('process-notification-queue')` | Removes dead cron job |
| 3 | `src/hooks/useLiveActivityOrchestrator.ts` | Remove polling fallback (`setInterval` block, lines 205-216). Keep app-resume one-shot sync | Eliminates polling dependency |
| 4 | `src/services/liveActivitySync.ts` | Add `'en_route'` to `ACTIVE_STATUSES` | Ensures app-resume catches en_route orders |

### Answers to Mandatory Questions

**Why does system still need cron?** It doesn't. The cron job calls the wrong URL and does nothing. The realtime trigger is the sole delivery path.

**What prevents pure realtime reliability?** The trigger's missing `EXCEPTION` handler — if `net.http_post` fails, the notification INSERT rolls back and is silently lost. Fix #1 addresses this.

**Where is the single point of truth for state?** `notification_queue` table (for push) and `LiveActivityManager.active` Map reconciled with native `Activity.activities` (for Live Activities).

