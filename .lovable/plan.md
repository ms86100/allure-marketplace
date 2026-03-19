

# Live Activity + Tracking + Notification — Production Audit

## SECTION 1: FINDINGS

### CRITICAL Issues

| # | Issue | Location | Severity | User Impact |
|---|-------|----------|----------|-------------|
| 1 | **Hardcoded TERMINAL_STATUSES in push handler** | `usePushNotifications.ts:319` | Critical | Terminal push events for admin-added terminal statuses (e.g. `failed_delivery`, `returned`) will NOT trigger Live Activity termination. Dynamic Island persists after order is done. |
| 2 | **Hardcoded TERMINAL_STATUSES fallback in LiveActivityManager** | `LiveActivityManager.ts:42-44` | Critical | Before DB loads, any status not in the hardcoded set is treated as non-terminal. If DB load fails, system permanently uses hardcoded set. |
| 3 | **Hardcoded TERMINAL_STATUSES fallback in orchestrator** | `useLiveActivityOrchestrator.ts:14-16` | Critical | Same as above — pre-DB-load terminal checks miss admin-configured terminals. |
| 4 | **Safety net hardcoding in statusFlowCache** | `statusFlowCache.ts:41-43` | High | `getTerminalStatuses()` force-adds `delivered, completed, cancelled, no_show` regardless of DB. If admin renames/removes these, stale entries pollute the set. |
| 5 | **Hardcoded `'placed'` and `'delivered'` exclusion in getStartStatuses** | `statusFlowCache.ts:52` | High | If admin renames the initial status or delivery status, LA start logic breaks silently. |
| 6 | **Hardcoded transit status check in update-delivery-location** | `update-delivery-location/index.ts:464` | High | `['picked_up', 'on_the_way', 'at_gate'].includes(...)` — APNs pushes only fire for these 3 statuses. Admin-added transit statuses get no background LA updates. |
| 7 | **Hardcoded TRANSIT_STATUSES in visibilityEngine** | `visibilityEngine.ts:26-31` | Medium | ActiveOrderStrip pulse animation only triggers for 4 hardcoded statuses, not DB-driven transit set. |
| 8 | **Hardcoded `'at_gate'` append in liveActivityMapper** | `liveActivityMapper.ts:111` | Medium | `at_gate` hardcoded into transit set alongside DB values. |
| 9 | **Duplicate request_service flow rows** | DB query result | Medium | `request_service` has duplicate flow entries (sort_order 1-7 AND 10-70). This causes incorrect progress calculation (deriveProgressPercent gets wrong min/max sort_order). |

### HIGH Issues

| # | Issue | Location | Severity | User Impact |
|---|-------|----------|----------|-------------|
| 10 | **Throttle can skip terminal state** | `LiveActivityManager.ts:469-481` | High | If terminal update arrives within 5s throttle window, it queues via `setTimeout`. The `push()` method handles terminal via early return (line 322), but if the status arrives via `throttledUpdate` path (existing entry), the pending timer fires `doUpdate` which does NOT check for terminal — it just calls `updateLiveActivity`. Terminal end happens only via `push()` top-level check. **However**, the orchestrator calls `LiveActivityManager.end()` directly for terminal statuses (line 97), so the throttle race is mitigated. Still, a rapid `non-terminal → terminal` within 5s could leave a stale pending timer that fires an update AFTER end. The `doUpdate` guard at line 485 (`!this.active.has(data.entity_id)`) prevents this. **PASS** — mitigated. |
| 11 | **No `no_show` in request_service flow** | DB | High | Service orders have no `no_show` terminal status. If the system tries to transition to `no_show`, it won't match the flow. |
| 12 | **Notification dedup for proximity uses 30s window** | `update-delivery-location/index.ts:400-426` | Medium | If seller oscillates near threshold boundary, buyer gets repeated proximity notifications every 30s. |

### Architecture Assessment

| System | Verdict | Notes |
|--------|---------|-------|
| **Live Activity lifecycle** | PASS (with issues above) | start → update → end lifecycle correctly tied to DB status via orchestrator. Dedup via `starting` set + native check. |
| **Hydration/dedup on restart** | PASS | Persisted map + native getActiveActivities reconciliation + stale cleanup. |
| **APNs background updates** | PASS (with issue #6) | Delta-based push with throttle floor, ETA/distance deltas. Terminal sends `event: "end"` with `dismissal-date`. |
| **Dynamic Island navigation** | PASS | Tap uses `appStateChange` → deferred navigation via `sessionStorage`. |
| **Realtime subscriptions** | PASS | Auto-reconnect with 3 retries + polling heartbeat (15s) as safety net. |
| **Push-driven terminal sync** | FAIL (issue #1) | Hardcoded terminal check means non-standard terminals don't fire the CustomEvent. |
| **Notification silent_push** | PASS | `silent_push` flag is DB-driven per flow step. |
| **Multi-device** | PASS | APNs token is per-device via `apns_token` dedup. Realtime channels are per-user. |

---

## SECTION 2: FIX PLAN

### Fix 1: Eliminate all hardcoded status sets in Live Activity stack

**Files:** `usePushNotifications.ts`, `LiveActivityManager.ts`, `useLiveActivityOrchestrator.ts`, `statusFlowCache.ts`

**Approach:**
- Remove hardcoded `TERMINAL_STATUSES` array in `usePushNotifications.ts:319`. Instead, import and use `getTerminalStatuses()` from `statusFlowCache` (already cached). Since the push handler is async-compatible, load the set once at listener setup time and store in a ref.
- Remove hardcoded fallback sets in `LiveActivityManager.ts:42-47`. If DB load fails, use empty sets and log a critical warning. The orchestrator's polling heartbeat (15s) will catch any missed terminals.
- Remove hardcoded fallback in `useLiveActivityOrchestrator.ts:14-16`. Start with empty set, populate from DB on init.
- Remove the "safety net" force-add in `statusFlowCache.ts:40-43`. The DB is the source of truth. If those statuses aren't in the DB, they shouldn't be in the set.
- Remove hardcoded `'placed'` and `'delivered'` exclusion in `getStartStatuses`. Instead, add a DB column `starts_live_activity boolean DEFAULT false` to `category_status_flows`, OR derive it: non-terminal statuses where `sort_order > min(sort_order)` should start LA (i.e., everything except the very first step).

### Fix 2: Make transit status checks DB-driven everywhere

**Files:** `update-delivery-location/index.ts`, `visibilityEngine.ts`, `liveActivityMapper.ts`

- `update-delivery-location/index.ts:464`: Replace hardcoded array with `transit_statuses_la` from `system_settings` (already loaded earlier in the function for proximity — reuse it).
- `visibilityEngine.ts:26-31`: Remove hardcoded `TRANSIT_STATUSES` export. Either make it load from DB (async), or since this is a shared constant, load from `getTrackingConfigSync()`.
- `liveActivityMapper.ts:111`: Remove hardcoded `'at_gate'` append — it's already in `transit_statuses_la` DB setting.

### Fix 3: Clean up duplicate request_service flow rows

**Migration:** Delete the duplicate rows (sort_order 1-7) that conflict with the canonical rows (sort_order 10-70).

### Fix 4: Add `no_show` to request_service flow

**Migration:** Insert `no_show` as terminal/not-success for `request_service` if the business requires it.

---

## Files to Modify

1. **Migration** — Remove duplicate `request_service` rows, optionally add `no_show`
2. **`src/services/statusFlowCache.ts`** — Remove hardcoded safety net and `'placed'`/`'delivered'` exclusions
3. **`src/services/LiveActivityManager.ts`** — Remove hardcoded fallback status sets
4. **`src/hooks/useLiveActivityOrchestrator.ts`** — Remove hardcoded terminal cache initial value
5. **`src/hooks/usePushNotifications.ts`** — Replace hardcoded terminal array with DB-driven set
6. **`src/lib/visibilityEngine.ts`** — Replace hardcoded transit set with DB-driven config
7. **`src/services/liveActivityMapper.ts`** — Remove hardcoded `'at_gate'` append
8. **`supabase/functions/update-delivery-location/index.ts`** — Replace hardcoded transit check with DB lookup

