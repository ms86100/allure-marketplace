

# Revised Plan: Hardening the DB-Driven Status Engine with Failure-Safe Fallbacks

## Gaps Being Fixed (from review feedback)

1. **Empty fallback is dangerous** — if DB fails, Live Activities never end
2. **Push handler loads terminal set once at init** — misses cold-start race
3. **`getStartStatuses` derives from sort_order** — fragile for non-linear flows
4. **Duplicate flow row deletion is risky** — could break historical references
5. **Transit statuses should eventually be a DB flag** — acknowledged, deferred

## Changes

### 1. Three-Tier Fallback in `statusFlowCache.ts`

Replace the current "empty on failure" approach with: **DB → expired cache → persistent KV → minimal safe fallback**

```
DB fresh?  → use it
DB stale?  → use expired cache (still in memory)
No cache?  → load from persistent-kv (last known good, survives app restart)
Nothing?   → safe fallback: Set(['completed']) + console.error
```

On every successful DB load, persist the terminal set to persistent-kv (`status_flow_terminal_cache`). This means even after a cold start with no network, the last-known terminal set is available synchronously.

The safe fallback `['completed']` is the absolute minimum — it only contains the universal final state. It is NOT business logic; it's a degradation safety net. A critical warning is logged whenever it activates.

### 2. Push Handler: Dynamic Terminal Resolution

Current code loads `terminalStatusesRef.current` once at listener setup. Fix:

- **Primary**: Use `is_terminal` flag from the push payload (already implemented: `data?.is_terminal === 'true'`). This is the most reliable — it travels with the push itself.
- **Secondary**: Call `getTerminalStatuses()` **at event time** (not init time) inside the foreground handler. Since `getTerminalStatuses()` returns from cache in <1ms when warm, this has zero performance cost. When cold, it triggers a DB fetch which resolves quickly.
- Remove `terminalStatusesRef` entirely — it's unnecessary indirection when `getTerminalStatuses()` already caches internally.

This eliminates the cold-start race: even if the push arrives before DB loads, the `is_terminal` payload flag catches it. And if the payload flag is missing (older push format), the dynamic call fetches from cache/KV/fallback.

### 3. Explicit `starts_live_activity` DB Column

Add `starts_live_activity boolean NOT NULL DEFAULT false` to `category_status_flows`.

Set `true` for all non-initial, non-terminal statuses in `cart_purchase` and `seller_delivery` flows (the flows that have Live Activity support).

Update `getStartStatuses()` to simply: `SELECT status_key WHERE starts_live_activity = true`.

This removes the fragile `sort_order > min` derivation. Admins can now explicitly control which statuses trigger Live Activity start.

### 4. Duplicate Flow Rows: Soft Deprecation (NOT hard delete)

The duplicate `request_service` rows (sort_order 1-7 vs 10-70) belong to different `parent_group` values (`education_learning` vs `default`), so they're actually NOT duplicates — they were confirmed correct in the previous round. No action needed here.

### 5. LiveActivityManager: Same Three-Tier Fallback

`loadStatusSets()` already calls `getTerminalStatuses()` and `getStartStatuses()`. Since those functions now implement the three-tier fallback, the manager automatically benefits. Remove the `statusSetsLoaded` gate that prevents retry — if the first load got the safe fallback, allow re-fetch on next `push()` call.

### 6. Orchestrator: Same Pattern

`terminalStatusesCache` in the orchestrator already calls `getTerminalStatuses()`. The three-tier fallback propagates automatically. No structural change needed beyond removing the empty-set initialization comment.

## Files to Modify

1. **Migration** — Add `starts_live_activity` column to `category_status_flows`
2. **Data update** — Set `starts_live_activity = true` for appropriate statuses
3. **`src/services/statusFlowCache.ts`** — Implement three-tier fallback (DB → expired cache → persistent-KV → safe minimum), persist terminal set to KV on success, use `starts_live_activity` column
4. **`src/hooks/usePushNotifications.ts`** — Remove `terminalStatusesRef`, call `getTerminalStatuses()` dynamically at event time
5. **`src/services/LiveActivityManager.ts`** — Remove `statusSetsLoaded` gate to allow re-fetch after fallback
6. **`src/lib/persistent-kv.ts`** — Add `status_flow_terminal_cache` and `status_flow_start_cache` to the restore prefixes list

## What This Achieves

- **Zero-downtime degradation**: System always has a terminal set, even during DB outages or cold starts
- **No hardcoded business logic**: The safe fallback (`completed`) is not a business decision — it's a universal truth that "completed" means done
- **Push handler is race-proof**: `is_terminal` payload flag + dynamic cache lookup = no timing dependency
- **Admin-explicit LA control**: `starts_live_activity` flag means admins decide, not sort_order math

