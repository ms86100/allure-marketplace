

# Fix: Notifications, Real-Time Sync, Tracking, Toasts, Live Activity & Navigation

## Root Cause Analysis

### 1. Premature Proximity Notifications
The `update-delivery-location` edge function has the order status guard (lines 430-523), but the **en_route notification** at line 327 fires on the very first GPS update when `assignment.status === 'picked_up'` with NO check on the **order** status. For seller-delivery, the assignment enters `picked_up` immediately at acceptance while the order is still at `accepted`. The 2-minute age guard on proximity only applies to the proximity block (line 447), not to the en_route block.

### 2. Real-Time Status Not Syncing (Web)
The `useLiveActivityOrchestrator` is gated by `Capacitor.isNativePlatform()` (line 62, 84, 206, 323, 382, 397, 414). This means **zero** Live Activity orchestration runs on web. The `useOrderDetail` hook (line 121-125) subscribes to realtime on the specific order and calls `fetchOrder()` — this works. But the `ActiveOrderStrip` relies on query invalidation which does work via its own realtime subscription (line 101-115). The actual buyer order detail page has its own realtime subscription. The issue is that `useDeliveryTracking` only initializes when `deliveryAssignmentId` is set, and that depends on the assignment being created. For seller-delivery where the seller IS the rider, the assignment creation may lag behind the order status change.

### 3. Live Tracking "Setting up" Stuck
Line 387-394 in `OrderDetailPage.tsx`: Shows "Setting up live tracking..." when `isInTransit && !deliveryAssignmentId`. The `assignmentRetryCount` retry logic (line 109) only retries 5 times with max 8s delay. If the assignment hasn't been created by then, tracking never initializes. The user must close and reopen.

### 4. All Order Toasts
`useBuyerOrderAlerts` (lines 99-113) fires toast for every order status change. `useOrderDetail` (lines 153, 188, 194, 199, 209) fires toasts on seller/buyer actions. These are noisy and redundant with the in-app UI.

### 5. Live Activity Card (ActiveOrderStrip) Static
The `ActiveOrderStrip` does subscribe to realtime (line 101-115) and invalidates queries. It uses `refetchInterval: 15_000`. This should work. But the `display_label` is fetched from `category_status_flows` in a separate query (line 65-75) that may return stale data or miss the status if the flow entry doesn't exist for that status key.

### 6. Navigation Dead-End
Line 184: `showNav={!o.isChatOpen}` — bottom nav is hidden when chat is open. Line 188: back button uses `navigate(-1)` with fallback to `/orders`. This was already fixed in a prior iteration. The issue may be that when the user arrives from the ActiveOrderStrip (home → order detail), `window.history.length > 1` is true but `navigate(-1)` may go to the wrong place or fail silently if there's a redirect chain.

---

## Implementation Plan

### Phase 1: Fix Premature Notifications (Edge Function)

**File**: `supabase/functions/update-delivery-location/index.ts`

- Add order status check to the **en_route notification** block (line 327). Before sending, fetch the order status and only send if it's in `['picked_up', 'on_the_way', 'at_gate']` AND order is at least 2 minutes old (reuse the same guard pattern from the proximity block).
- This prevents "Your order is on the way!" from firing at `accepted` stage.

### Phase 2: Remove All Order Toasts

**File**: `src/hooks/useBuyerOrderAlerts.ts`
- Remove all `toast()` calls. Keep the realtime subscription for `queryClient.invalidateQueries` (this is essential for data freshness) and `hapticNotification` for native. Remove the toast import and all toast logic.

**File**: `src/hooks/useOrderDetail.ts`
- Remove `toast.success` calls on status updates (lines 153, 188). Keep `toast.error` calls for actual failures (these are actionable user errors, not notifications).
- Remove `toast.error` on timeout (line 199) — replace with in-page state.
- Remove `toast.success` on copy (line 209) — keep as-is since it's user-initiated feedback, not a notification.

### Phase 3: Fix Real-Time Sync for Web + Native

**File**: `src/hooks/useLiveActivityOrchestrator.ts`
- Remove `Capacitor.isNativePlatform()` gates from the **polling heartbeat** (line 323) and **visibility sync** (line 382) effects. These data reconciliation features benefit web too. Keep the native gate only for `LiveActivityManager.push/end` calls (which are native-only APIs).
- This ensures the `activeOrderIdsRef` tracking and `doSync` logic works on web, enabling query invalidation for `ActiveOrderStrip`.

**File**: `src/hooks/useOrderDetail.ts`
- The existing realtime subscription (line 121-125) already works for web. No change needed here.

### Phase 4: Fix Live Tracking Initialization

**File**: `src/pages/OrderDetailPage.tsx`
- Increase assignment retry from 5 to 10 attempts with up to 15s delay for the last retries. This handles the case where seller-delivery assignment creation lags.
- Add a realtime subscription fallback: if after all retries the assignment isn't found, keep the realtime subscription (line 119-132) active — it already listens for INSERT events on `delivery_assignments`. This is already correct, but the retry counter stopping at 5 means the loading state persists even though the subscription would catch the INSERT. Fix: Don't show "Setting up live tracking..." after retries exhaust — show "Waiting for delivery assignment..." with a manual retry button.

### Phase 5: Fix Navigation Dead-End

**File**: `src/pages/OrderDetailPage.tsx`
- Change back button from conditional `navigate(-1)` to always `navigate('/orders')`. The `-1` navigation is unreliable when arriving from deep links, push notifications, or the ActiveOrderStrip. Absolute navigation to `/orders` is always safe.
- Ensure `showNav` is always true for buyers (currently `showNav={!o.isChatOpen}` which hides nav during chat — this is correct behavior, not a bug). The real issue is the back button, not the nav.

### Phase 6: Fix ActiveOrderStrip Freshness

**File**: `src/components/home/ActiveOrderStrip.tsx`
- Reduce `refetchInterval` from 15s to 10s for tighter sync.
- The realtime subscription already invalidates queries on order UPDATE — this should work. The stale `display_label` issue: add the order status directly to the strip display as fallback.

---

## Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/update-delivery-location/index.ts` | Add order status + age guard to en_route notification block |
| `src/hooks/useBuyerOrderAlerts.ts` | Remove all toast calls, keep query invalidation + haptics |
| `src/hooks/useOrderDetail.ts` | Remove success toasts, keep error toasts |
| `src/hooks/useLiveActivityOrchestrator.ts` | Remove native-only gate from polling/visibility sync |
| `src/pages/OrderDetailPage.tsx` | Fix back button to always navigate `/orders`; improve assignment retry |
| `src/components/home/ActiveOrderStrip.tsx` | Reduce refetch interval |

