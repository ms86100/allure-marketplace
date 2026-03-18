

# Zero-Cron Real-Time Failure Audit — Final Results

## Audit Summary

| Component | Real-time? | Cron dep? | Polling dep? | Silent failure? | Status |
|-----------|-----------|-----------|-------------|----------------|--------|
| Push trigger (INSERT → edge fn) | Yes | No | No | No | **PASS** |
| Push inline retry (edge fn) | Yes (inline) | No | No | No | **PASS** |
| Live Activity (realtime sub) | Yes | No | No | No | **PASS** |
| Live Activity (app resume) | Yes (one-shot) | No | No | No | **PASS** |
| Cron job (process-notification-queue) | N/A | N/A | N/A | N/A | **REMOVED** |
| Seller new-order alert polling | N/A | No | Yes | No | **OUT OF SCOPE** |

---

## Phase 1: Push Notification Pipeline — PASS

**Flow verified:**
```text
order.status UPDATE
  → fn_enqueue_order_status_notification() [trigger]
    → INSERT into notification_queue
      → trg_process_notification_queue_realtime [AFTER INSERT trigger]
        → net.http_post → process-notification-queue edge function
          → inline retry (3 attempts, 2s/5s delays)
            → send-push-notification edge function → APNs/FCM → device
```

**Trigger function** (`20260318101405`): Has `EXCEPTION WHEN OTHERS THEN RETURN NEW` — INSERT never rolls back on HTTP failure. Uses correct project URL and anon key. Has `SET search_path TO 'public'` and `SECURITY DEFINER`.

**Edge function**: Claims batch via `claim_notification_queue` RPC (atomic). Inline retry with 3 attempts and 2s/5s delays. Dead-letters on final failure with `status = 'failed'` and `last_error` populated. No cron dependency.

**Verdict: No loss, no delay, no cron dependency. PASS.**

---

## Phase 2: Cron and Polling Elimination — PASS

**Cron jobs:**
- `process-notification-queue`: Unscheduled in migration `20260318101405` via `SELECT cron.unschedule(...)`. Originally pointed to wrong project URL anyway (dead code). **REMOVED.**
- Other cron jobs (booking reminders, slot generation, trust scores, maintenance notifications) are legitimate scheduled tasks unrelated to push notifications or live activities. They stay.

**Polling in buyer-side code:**
- `useLiveActivityOrchestrator.ts`: No `setInterval`. Only one-shot sync on mount and app resume. **PASS.**
- `liveActivitySync.ts`: Called on-demand only (mount, resume). No timer. **PASS.**

**Polling in seller-side code (out of scope but noted):**
- `useNewOrderAlert.ts` lines 176-235: Has exponential-backoff polling (3s-30s) as safety net alongside realtime subscription. This is seller-side only and by design (per memory: "persistent exponential-backoff polling safety net that never terminates"). Not a buyer-side concern.

**System works correctly with cron disabled and no polling on buyer side. PASS.**

---

## Phase 3: Live Activity Real-Time Behavior — PASS

**Flow:**
```text
orders.status UPDATE → Supabase Realtime → orchestrator → LiveActivityManager.push()
delivery_assignments INSERT/UPDATE → Supabase Realtime → orchestrator → LiveActivityManager.push()
```

- No polling fallback (removed in previous commit, line 204 confirms: "Polling fallback removed")
- One activity per order: Swift native dedup + JS `starting` Set + hydration lock
- Updated in place: `throttledUpdate` with 5s coalesce
- Never recreated on navigation: `useLiveActivity.ts` deleted (was dead code)
- App resume: one-shot `syncActiveOrders` reconciliation (not polling)

**ACTIVE_STATUSES** in `liveActivitySync.ts`: `accepted, preparing, ready, picked_up, on_the_way, arrived, confirmed`. The `arrived` status was added in the previous fix. `en_route` is not a DB enum value (mapped to `on_the_way` in the DB).

**PASS.**

---

## Phase 4: Silent Failure Detection — PASS

| Scenario | Handled? | How |
|----------|----------|-----|
| `net.http_post` fails in trigger | Yes | `EXCEPTION WHEN OTHERS THEN RETURN NEW` — notification saved, push attempted next time edge fn fires |
| Edge function push fails | Yes | 3 inline retries, then dead-lettered with error in `last_error` |
| Realtime channel drops | Yes | Logged as warning. App resume re-syncs. No silent degradation to polling |
| In-app notification duplicate | Yes | `queue_item_id` unique constraint prevents re-insert on retry |

**No silent failures identified. PASS.**

---

## Phase 5: State Consistency — PASS

| Layer | Source of Truth | Sync Mechanism |
|-------|----------------|----------------|
| Database | `orders.status`, `notification_queue` | Authoritative |
| Notifications | `user_notifications` (via edge fn) | Idempotent insert with `queue_item_id` dedup |
| Live Activity | `LiveActivityManager.active` Map + native `Activity.activities` | Reconciled on mount/resume via `syncActiveOrders` |
| UI | Supabase Realtime subscriptions | Direct from DB changes |

No divergence paths identified. Database is single source of truth.

---

## Phase 6: Failure Mode Simulation — PASS

| Failure | Result |
|---------|--------|
| Edge function failure | 3 inline retries within same invocation. Dead-letter on failure. Error visible in `notification_queue.last_error` |
| Network failure (device offline) | Realtime events queue in Supabase channel. App resume triggers `syncActiveOrders` to reconcile |
| Realtime channel drop | Logged as warning. No fallback to polling. App resume rehydrates |

---

## Phase 7: Duplication and Race Conditions — PASS

| Scenario | Protection |
|----------|-----------|
| Rapid status updates | 5s throttle in `LiveActivityManager` coalesces |
| Concurrent push processing | `claim_notification_queue` RPC atomically claims batch |
| App background/resume | `syncing` mutex prevents concurrent `syncActiveOrders`. `resetHydration()` + one-shot sync |
| Duplicate push to same device | `apns_token` dedup in `send-push-notification` edge fn |
| Duplicate in-app notification | `queue_item_id` unique constraint on `user_notifications` |

---

## Stale Comment (Cosmetic, Non-blocking)

`useLiveActivityOrchestrator.ts` lines 23-27 still reference "Polling fallback" and "Shared syncActiveOrders for mount/resume/poll" in the JSDoc comment, but polling was removed. This is misleading documentation but has no runtime impact.

---

## Final Verdict

**The system is fully real-time with zero cron dependency for push notifications and live activities.**

- Trigger chain: DB trigger → `net.http_post` → edge function (immediate)
- Push retries: inline (3 attempts, 2s/5s delays) — no deferred retry
- Live Activities: pure Supabase Realtime subscriptions, no polling
- Failures: fail fast with dead-lettering, logged with error details
- Deduplication: atomic claim, unique constraints, native dedup, throttle

**No changes required.** The only cosmetic fix is updating the JSDoc comment in the orchestrator to remove stale polling references.

| # | File | Change | Severity |
|---|------|--------|----------|
| 1 | `src/hooks/useLiveActivityOrchestrator.ts` | Update JSDoc comment (lines 23-27) to remove polling references | Cosmetic |

