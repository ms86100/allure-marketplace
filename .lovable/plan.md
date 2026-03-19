

# Fix: Dynamic Island Dismissal, Stale Navigation, and Progress Accuracy

## Problems Identified

### 1. Dynamic Island persists after delivery completion
The `useLiveActivityOrchestrator` ends the Live Activity when it receives a realtime `UPDATE` event with a terminal status. But when the app is backgrounded or killed, the realtime channel is not active. The APNs push from `update-live-activity-apns` sends `event: "end"` with a `dismissal-date` of now+5 seconds, which is correct -- but the orchestrator also needs to end the activity on app resume. Currently, `syncActiveOrders` only syncs **non-terminal** orders, so completed orders are never processed to trigger `end()`. The `doSync` refreshes `activeOrderIdsRef` but does not explicitly call `LiveActivityManager.end()` for orders that have transitioned to terminal while the app was in the background.

### 2. Stale order data when tapped from Dynamic Island
The `useOrderDetail` hook fetches order data in a `useEffect` with `[id]` as the dependency. When tapping the Dynamic Island, the deep link navigates to `/orders/{orderId}`. If the component is **already mounted** with the same `id`, the effect does not re-run, so stale data persists. Additionally, `useAppLifecycle` does not invalidate the order detail since `useOrderDetail` uses raw `useState` (not React Query).

### 3. Progress indicator not tied to real ETA
The compact trailing circle in the Dynamic Island shows `progressPercent`, which is derived from the `sort_order` ratio of the status flow table. During transit, the mapper attempts GPS-based progress but the `transit_statuses_la` setting is `["en_route","on_the_way","picked_up"]` -- it doesn't include `at_gate`. More importantly, the iOS widget's compact trailing view renders a static arc, not a meaningful ETA countdown.

---

## Plan

### Fix 1: End stale Live Activities on app resume

**File: `src/services/liveActivitySync.ts`**

After syncing active (non-terminal) orders, query the native `getActiveActivities()` and cross-reference. For any native activity whose `entityId` is NOT in the set of active non-terminal orders, call `LiveActivityManager.end()`. This ensures that if the order completed while backgrounded, the Dynamic Island is dismissed on resume.

### Fix 2: Force refetch on deep-link navigation

**File: `src/hooks/useOrderDetail.ts`**

Add a `refetch` counter state that increments on visibility change (via `document.addEventListener('visibilitychange')`) and on `appStateChange`. Include this counter in the fetch `useEffect` dependency array so the order data is always re-fetched when the app resumes or comes to the foreground. This ensures tapping the Dynamic Island always shows fresh data.

**File: `src/hooks/useAppLifecycle.ts`**

Dispatch a custom event (`order-detail-refetch`) that `useOrderDetail` listens to, triggering an immediate re-fetch of the current order.

### Fix 3: Dynamic Island progress tied to real ETA during transit

**File: `src/services/liveActivityMapper.ts`**

When in transit and ETA is available, derive `progressPercent` from ETA rather than distance alone. Use a formula like `1 - (eta_minutes / max_eta)` clamped to `[0.1, 0.95]`, where `max_eta` is the initial estimated delivery time. This makes the progress bar and the compact trailing arc meaningful.

Also add `at_gate` to the `transit_statuses_la` system setting so GPS-based progress applies at the gate too.

### Fix 4: APNs dismissal-date too short

**File: `supabase/functions/update-live-activity-apns/index.ts`**

Change `dismissal-date` from `now + 5` to `now + 4` (Apple minimum is 4s). This is already close to correct -- the real fix is #1 above.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/services/liveActivitySync.ts` | End native activities for orders that have become terminal while backgrounded |
| `src/hooks/useOrderDetail.ts` | Re-fetch order data on app resume / visibility change to prevent stale state |
| `src/hooks/useAppLifecycle.ts` | Dispatch `order-detail-refetch` event on resume |
| `src/services/liveActivityMapper.ts` | Use ETA-based progress during transit instead of distance-only |
| Database (system_settings) | Add `at_gate` to `transit_statuses_la` |

