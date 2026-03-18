

# Production Gaps: Delayed Push Notifications + Live Activity Issues

## Critical Finding 1: Delayed Push Notifications (Root Cause Found)

### Problem
The realtime trigger (`trg_process_notification_queue_realtime`) calls `net.http_post` using `current_setting('app.settings.supabase_url', true)` and `current_setting('app.settings.anon_key', true)`. These PostgreSQL config variables are **never set** in any migration — there is no `ALTER DATABASE` or `set_config` statement configuring them. The `true` parameter makes `current_setting` return `NULL` when unset instead of erroring, so the HTTP call silently fails with a NULL URL.

Additionally, the cron fallback in migration `20260302181927` hardcodes the **wrong project URL**: `rvvctaikytfeyzkwoqxg.supabase.co` instead of `ywhlqsgvbkvcvqlsniad.supabase.co`. The cron job calls a non-existent project, so it also fails silently. The 5-minute delay is likely coming from some other safety-net mechanism or eventual retry.

### Fix
1. **Database migration**: Replace the `trigger_process_notification_queue` function to use the correct hardcoded project URL (`ywhlqsgvbkvcvqlsniad`) and anon key, since `app.settings.*` config vars are not reliably available in Lovable Cloud's Supabase.
2. **Fix the cron job**: Re-schedule with the correct project URL.

## Critical Finding 2: `useLiveActivity` Hook Ends Activity on Page Leave

### Problem
`useLiveActivity.ts` line 57-66 has a cleanup effect that calls `LiveActivityManager.end(prev)` when the `entityId` changes or the component unmounts. This means: when a buyer navigates **away from the order detail page**, the Live Activity is ended. Then on the next poll (15s) or realtime event, `syncActiveOrders` recreates it — creating a new native activity each time the user navigates in and out.

The orchestrator (`useLiveActivityOrchestrator`) manages activities globally and is the correct single owner. The `useLiveActivity` hook fights against it by ending activities on page unmount.

### Fix
Remove the cleanup effect from `useLiveActivity.ts` (lines 57-66). The orchestrator already handles the full lifecycle. The hook should only push updates, never end activities.

## Critical Finding 3: `useLiveActivity` Sends Incomplete Data

### Problem
`useLiveActivity.ts` always sends `progress_percent: null` and `seller_name: null` (lines 49-50), even though the mapper and orchestrator correctly compute these values. When the order detail page is open, this hook fires updates with missing progress/seller data, overwriting the richer data from the orchestrator.

### Fix
Either remove the `useLiveActivity` hook entirely (the orchestrator handles everything), or have it use `buildLiveActivityData` to compute proper values.

## Summary of Changes

| # | File | Change | Impact |
|---|------|--------|--------|
| 1 | New migration SQL | Fix `trigger_process_notification_queue` to use correct project URL + anon key instead of unset `app.settings.*` | Fixes delayed push notifications |
| 2 | New migration SQL | Fix cron job URL from `rvvctaikytfeyzkwoqxg` to `ywhlqsgvbkvcvqlsniad` | Fixes cron fallback |
| 3 | `src/hooks/useLiveActivity.ts` | Remove cleanup effect that ends activity on page unmount (lines 57-66). Remove `progress_percent: null` / `seller_name: null` overrides | Stops duplicate Live Activities caused by unmount→recreate cycle |

### Why Previous Fixes Did Not Work
- The Swift native dedup (checking existing activities by entityId) IS correct and works for true concurrent starts. But the duplication was caused by `useLiveActivity` **ending** the activity on page leave, then the orchestrator recreating it — native dedup cannot help because the activity was legitimately ended first.
- The `syncing` mutex in `liveActivitySync.ts` works correctly but doesn't prevent the `useLiveActivity` hook from independently ending activities.

