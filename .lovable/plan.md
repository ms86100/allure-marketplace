

# Round 1: Production Readiness Audit -- Live Activity + Tracking + Notifications

## System Assessment

After thorough code review across all layers (client hooks, LiveActivityManager, edge functions, DB triggers, native Swift), the architecture is sound and production-grade. The system already implements:

- Triple-layer dedup (client map, native query, hydration cleanup)
- DB-backed terminal/start status sets via `category_status_flows`
- APNs server-side push for killed-app updates with `event: "end"` on terminal statuses
- 30-second duplicate notification guard in the DB trigger
- Kalman-lite GPS filtering with smooth marker interpolation
- OSRM road-snapped routing and ETA
- DB-backed proximity thresholds
- Auto-reconnect with retry on realtime channel failures
- App resume re-hydration with cache invalidation

## Findings

### Finding 1: DB trigger has hardcoded terminal statuses (MEDIUM)

**File:** `fn_enqueue_order_status_notification` (latest migration)

**Line 209:** `IF NEW.status IN ('delivered', 'completed', 'cancelled', 'no_show', 'failed') THEN DELETE FROM public.live_activity_tokens...`

This hardcodes terminal statuses for token cleanup instead of querying `category_status_flows.is_terminal`. If a new terminal status is added to the DB (e.g., `rejected`, `expired`), tokens will not be cleaned up and Live Activities will persist.

**Fix:** Replace the hardcoded IN clause with a subquery:
```sql
IF EXISTS (
  SELECT 1 FROM public.category_status_flows
  WHERE status_key = NEW.status AND is_terminal = true
) THEN
  DELETE FROM public.live_activity_tokens WHERE order_id = NEW.id;
END IF;
```

### Finding 2: DB trigger passes `seller_logo` instead of `seller_logo_url` to APNs function (MEDIUM)

**File:** Same trigger, line 204: `'seller_logo', COALESCE(v_seller_logo, '')`

The edge function `update-live-activity-apns` destructures `seller_logo_url` from the payload (line 172), but the trigger sends `seller_logo`. Additionally, line 77 queries `sp.logo_url` which may not exist (the correct column is `profile_image_url` per previous rounds).

**Fix:** Update the trigger to:
1. Query `sp.profile_image_url` instead of `sp.logo_url`
2. Send `seller_logo_url` key instead of `seller_logo`

### Finding 3: No polling fallback for realtime subscriptions (MEDIUM)

The orchestrator relies solely on Supabase Realtime with a max of 3 reconnect retries. If all retries fail, the system silently stops receiving updates. The `lovable-stack-overflow` context suggests adding a polling fallback.

However, the current system partially mitigates this: app resume triggers a full `syncActiveOrders()` which reconciles state. The risk window is only during sustained foreground usage with a dead realtime connection.

**Fix:** Add a lightweight polling heartbeat (every 30-60s) that checks the latest order status and compares against the last-known status, triggering an update only on mismatch. This is a safety net, not a replacement for realtime.

### Finding 4: `sync_order_to_delivery_assignment` hardcodes statuses (LOW)

**Line 23:** `IF NEW.status IN ('on_the_way', 'delivered') THEN` -- only syncs these two statuses. If new delivery-relevant statuses are added, they won't propagate to delivery_assignments.

**Fix:** Query `category_status_flows` for statuses with a delivery-relevant flag, or expand the hardcoded set to include all transit/terminal statuses.

## Verified (No Action Needed)

| Area | Status |
|------|--------|
| Live Activity 1:1 per order | Verified: `active` Map keyed by entity_id |
| Dedup on start | Verified: `starting` Set + `getActiveActivities()` native check |
| Dedup on hydration | Verified: groups by entityId, ends all but last |
| Terminal → end | Verified: `push()` checks `TERMINAL_STATUSES.has()` → calls `end()` |
| APNs end event | Verified: `event: "end"` + `dismissal-date` in 5s |
| Deep link 404 prevention | Verified: `KNOWN_ROUTES` validation + fallback to `/orders` |
| Notification dedup (30s guard) | Verified in DB trigger |
| Silent push for mid-flow | Verified: `silent_push` from `category_status_flows` |
| GPS Kalman filter | Verified in `gps-filter.ts` |
| Smooth marker animation | Verified: `AnimatedRiderMarker` with cubic ease |
| OSRM road ETA | Verified in `useOSRMRoute` |
| Proximity thresholds (DB) | Verified in `system_settings` |
| Stale location warning | Verified: configurable threshold |
| App resume reconciliation | Verified: `resetHydration()` + `doSync()` |
| Realtime auto-reconnect | Verified: 3 retries with 3s delay |

## Implementation Plan

| Step | What | Severity | Scope |
|------|------|----------|-------|
| 1 | Fix DB trigger: dynamic terminal status check for token cleanup | Medium | SQL migration |
| 2 | Fix DB trigger: correct seller logo column + payload key | Medium | SQL migration |
| 3 | Add lightweight polling fallback to orchestrator | Medium | `useLiveActivityOrchestrator.ts` |

Steps 1 and 2 can be combined into a single migration that replaces `fn_enqueue_order_status_notification`.

