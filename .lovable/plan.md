

# Eliminate Foreground Stale State — Full Implementation Plan

## Critical Bugs Found During Investigation

Two issues in `usePushNotifications.ts` would **break** the push-driven sync if not addressed:

### Bug 1: Field Name Mismatch
- Line 315: `const orderId = data?.order_id ?? data?.entity_id;`
- The DB trigger (`fn_enqueue_order_status_notification`) sends payload as: `jsonb_build_object('orderId', NEW.id::text, 'status', NEW.status::text, ...)`
- The push data arrives with key `orderId` (camelCase), NOT `order_id` (snake_case)
- So `data?.order_id` is always `undefined` — the orderId is only found if `entity_id` happens to exist
- **Fix**: Change to `data?.orderId ?? data?.order_id ?? data?.entity_id`

### Bug 2: Early Return Suppresses Terminal Pushes
- Lines 316-319: When a Live Activity is tracking an order, the handler returns early — skipping everything
- This means a `delivered` push for a tracked order is **silently dropped**
- The terminal sync event would never fire
- **Fix**: Move the terminal-status dispatch BEFORE the suppression check, or restructure so terminal events are never suppressed

---

## Implementation Plan (3 files, 4 changes)

### Change 1: `src/hooks/usePushNotifications.ts` — Dispatch terminal event + fix field name

In the `pushNotificationReceived` listener (lines 306-353):

1. Fix orderId extraction: `data?.orderId ?? data?.order_id ?? data?.entity_id`
2. After extracting orderId and before the Live Activity suppression check, dispatch the terminal event:

```typescript
const data = notification?.data as Record<string, string> | undefined;
const orderId = data?.orderId ?? data?.order_id ?? data?.entity_id;
const pushStatus = data?.status;

// CRITICAL: Dispatch terminal sync BEFORE suppression check
// Terminal pushes must always trigger state reconciliation
const TERMINAL_STATUSES = ['delivered', 'completed', 'cancelled', 'no_show'];
if (orderId && pushStatus && TERMINAL_STATUSES.includes(pushStatus)) {
  pushLog('info', 'TERMINAL_PUSH_SYNC', { orderId, status: pushStatus });
  window.dispatchEvent(new CustomEvent('order-terminal-push', {
    detail: { orderId, status: pushStatus }
  }));
}

// Suppress duplicate toast alert if Live Activity is already tracking
if (orderId && LiveActivityManager.isTracking(orderId)) {
  pushLog('info', 'FOREGROUND_SUPPRESSED_LA_ACTIVE', { orderId });
  return;
}
```

This is additive — the frozen architecture (dual-plugin, token flow, listener gate) is unchanged. We're only adding 6 lines before the existing suppression check.

### Change 2: `src/hooks/useLiveActivityOrchestrator.ts` — Listen for `order-terminal-push`

Add a new `useEffect` after the existing visibility change listener:

```typescript
useEffect(() => {
  if (!userId || !Capacitor.isNativePlatform()) return;

  const handler = async (e: Event) => {
    const { orderId, status } = (e as CustomEvent).detail;
    console.log(TAG, 'Push-driven terminal sync:', orderId, status);
    await LiveActivityManager.end(orderId);
    // Small delay to let DB settle, then sync
    setTimeout(() => doSync(), 300);
  };

  window.addEventListener('order-terminal-push', handler);
  return () => window.removeEventListener('order-terminal-push', handler);
}, [userId, doSync]);
```

The 300ms delay before `doSync()` addresses the race condition concern — ensures the DB is consistent before the query runs. `LiveActivityManager.end()` fires immediately (no delay).

### Change 3: `src/components/home/ActiveOrderStrip.tsx` — Respond to terminal push + refetch on focus

Two additions:
1. Add `refetchOnWindowFocus: true` to the `useQuery` options
2. Add a `useEffect` that listens for `order-terminal-push` and invalidates the query:

```typescript
const queryClient = useQueryClient();

useEffect(() => {
  const handler = () => {
    queryClient.invalidateQueries({ queryKey: ['active-orders-strip'] });
  };
  window.addEventListener('order-terminal-push', handler);
  return () => window.removeEventListener('order-terminal-push', handler);
}, [queryClient]);
```

---

## How This Achieves Zero Stale State

```text
Order becomes terminal on server
       │
       ├── Path 1: Supabase Realtime (primary)
       │   └── Instant → handleOrderUpdate → LiveActivityManager.end()
       │
       ├── Path 2: Push Notification (independent backup)
       │   └── DB trigger → notification_queue → process-notification-queue
       │       → send-push-notification → foreground handler
       │       → CustomEvent('order-terminal-push')
       │       → Orchestrator: end() + doSync()
       │       → ActiveOrderStrip: invalidateQueries()
       │
       ├── Path 3: Visibility/Resume sync (user interaction)
       │   └── visibilitychange / appStateChange → doSync()
       │
       └── Path 4: Polling (15s safety net)
           └── Last resort if all above fail
```

## Guarantee Matrix

| Realtime | Push | Result |
|----------|------|--------|
| ✅ | ✅ | Instant (Realtime fires first) |
| ❌ | ✅ | Instant (push-driven sync) |
| ✅ | ❌ | Instant (Realtime handles it) |
| ❌ | ❌ | 15s polling (both channels dead — near-impossible) |

## Final Guarantees

| Question | Answer |
|----------|--------|
| Can stale state exist in foreground? | **NO** — push provides independent instant sync |
| Is polling required for correctness? | **NO** — polling is 4th-tier fallback |
| Does system rely on user interaction? | **NO** — push fires automatically |
| Can progress mismatch between foreground/background? | **NO** — unified dynamic MAX_ETA |

## Race Condition Mitigation

The user's concern about `doSync()` running before DB is consistent is addressed by:
1. `LiveActivityManager.end()` fires immediately (no DB dependency)
2. `doSync()` runs after 300ms delay — sufficient for Postgres trigger + queue processing
3. If `doSync()` still sees old state (extremely rare), the 15s polling catches it on next tick

