

# Stale Order Cleanup & Notification Hygiene

## The Problem (Swiggy/Zomato Comparison)

When you test orders and leave some incomplete (especially failed online payments), the next day when you open the app:
- **Live Activity cards** appear for old delivered/cancelled orders → takes you to wrong order
- **Push notifications** flood in for stale orders
- **Home banner** shows outdated status notifications you already dealt with
- **Active Order Strip** shows ghost orders that are long done

Swiggy/Zomato solve this by: (1) aggressively cancelling unpaid orders within minutes, (2) never showing live tracking for orders older than a few hours, (3) only notifying for the *current* active order lifecycle.

## Root Causes Found

1. **Live Activity orchestrator includes `payment_pending` orders** — ActiveOrderStrip correctly excludes them, but the orchestrator doesn't, so native Dynamic Island cards appear for unpaid ghost orders
2. **No recency guard** — an order from 3 days ago in `placed` status still triggers a live activity on app resume
3. **Home banner query** fetches the latest unread notification regardless of whether the linked order is already delivered/completed — so you see "Order Placed" for an order that's already done
4. **Server auto-cancel runs on cron** but not on app cold-start, so stale `payment_pending` orders can linger until the next cron run

## Fixes (6 surgical changes, no new features)

### 1. Exclude `payment_pending` from Live Activity sync
**Files:** `src/hooks/useLiveActivityOrchestrator.ts`, `src/services/liveActivitySync.ts`

Add `payment_pending` to the exclusion filter in `doSync()` and `syncActiveOrders()`, matching what `ActiveOrderStrip` already does. These are pre-flow orders — they should never trigger a Dynamic Island card.

### 2. Add 2-hour recency guard to Live Activity sync
**File:** `src/services/liveActivitySync.ts`

Add `.gte('created_at', twoHoursAgo)` to the active orders query. Orders older than 2 hours that are still non-terminal are edge cases (stale test data, stuck workflows) and should not spawn live activities. This matches how Swiggy stops tracking after a reasonable window.

### 3. Filter home notification banner by order freshness
**File:** `src/hooks/queries/useNotifications.ts` (`useLatestActionNotification`)

When checking order-linked notifications, also verify the linked order was created within the last 24 hours. Old order notifications for terminal orders are already marked read — but non-terminal stale orders (like abandoned `payment_pending`) still surface. Adding a recency check prevents yesterday's test orders from showing up as today's banner.

### 4. Add 24-hour age cap to ActiveOrderStrip
**File:** `src/components/home/ActiveOrderStrip.tsx`

Add `.gte('created_at', twentyFourHoursAgo)` to the query. If an order is 24+ hours old and still "placed", it's not a real active order — it's stuck test data. Real orders move through the pipeline within hours.

### 5. Auto-mark stale notifications on app resume
**File:** `src/hooks/queries/useNotifications.ts`

The existing `cleanupStaleDeliveryNotifications` already marks delivery notifications for terminal orders as read. Extend this to also cover `order_status` and `order_update` notification types for terminal orders, so the inbox doesn't accumulate ghost alerts.

### 6. Trigger auto-cancel on cold start
**File:** `src/contexts/auth/useAuthState.ts` or `src/hooks/useAppLifecycle.ts`

On app resume/cold-start, fire a single `supabase.functions.invoke('auto-cancel-orders')` call. This immediately cleans up any `payment_pending` orders older than 30 min that the cron hasn't swept yet, before the live activity orchestrator picks them up.

## Files to Change

| File | Fix |
|------|-----|
| `src/hooks/useLiveActivityOrchestrator.ts` | 1 |
| `src/services/liveActivitySync.ts` | 1, 2 |
| `src/hooks/queries/useNotifications.ts` | 3, 5 |
| `src/components/home/ActiveOrderStrip.tsx` | 4 |
| `src/hooks/useAppLifecycle.ts` (or auth state) | 6 |

## Expected Outcome

After these fixes:
- Opening the app next day → no stale live cards, no flood of old notifications
- Abandoned online payments → cleaned up within minutes, never shown as active
- Home banner → only shows notifications for genuinely active, recent orders
- Like Swiggy: only current orders get tracking, old ones silently archived

