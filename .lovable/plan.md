

# Fix: Notifications, Live Activity Updates, Navigation & Rider Icon

## Problems Identified

### 1. Premature Proximity Notifications
**Evidence**: Notification queue for order `7f66fa5f` shows both "Almost there!" and "Driver arriving now!" fired at `08:58:04` — just 22 seconds after the order was placed (`08:57:42`), while the order was still at "Accepted" stage.

**Root cause**: The `update-delivery-location` edge function fires proximity notifications based solely on **assignment status** (`picked_up`, `on_the_way`, `at_gate`) without checking the **order's workflow stage**. For seller-delivery orders, the seller IS the delivery partner and is already physically close (171m in a housing society). The assignment auto-enters `picked_up` immediately, so the first GPS update triggers proximity alerts while the buyer just placed the order.

**Additional bug**: Both the `<500m` and `<200m` proximity checks fire in the same function call because 171m satisfies both conditions simultaneously — causing duplicate notifications.

### 2. Live Activity Card Stuck
**Root cause**: The `useLiveActivityOrchestrator` subscribes to `orders` table changes and calls `buildLiveActivityData`, which fetches `category_status_flows` entries filtered to `cart_purchase` and `seller_delivery`. The `liveActivitySync` also uses this filter. The issue is the `syncActiveOrders` function and the realtime handler both call `LiveActivityManager.push()` but the native bridge may be silently failing or the initial hydration on mount races with the realtime subscription setup. The `doSync` on mount only runs once, but `flowEntriesRef` may still be empty when the first realtime event arrives (race between `fetchFlowEntries` and the order update).

### 3. Navigation Trap on Order Detail
**Root cause**: The back button uses `navigate('/orders')` which should work. However, looking at `AppLayout`, when `showNav` is false (which happens for seller view on non-terminal orders), AND if the user navigates to this page from a live activity deep link or external source, the navigation stack may not have `/orders` in history. The `navigate('/orders')` call should still work as an absolute navigation. Need to check if there's a conditional rendering issue blocking the back button or if an error boundary is trapping the page.

### 4. Rider Icon Clarity
**Root cause**: The current SVG icon is a 48x48 custom illustration with tiny details (4px text for "Sociva", small scooter body, thin strokes) that become illegible at map zoom levels. The bag branding text is 4px font-size which is essentially invisible.

---

## Implementation Plan

### Phase 1: Fix Proximity Notifications (Edge Function)

**File**: `supabase/functions/update-delivery-location/index.ts`

- **Add order status guard**: Before sending proximity notifications, fetch the order's current status and only send if the order is in an actual transit stage (`on_the_way`, `at_gate`, or later delivery stages). This prevents notifications when the order is still at `accepted` or `preparing`.
- **Make proximity tiers mutually exclusive**: If distance < 200m, send ONLY the "imminent" notification, skip the "nearby" one. Currently both fire because the code checks `<500` then independently checks `<200`.
- **Add minimum order age guard**: Don't send proximity notifications if the order was placed less than 2 minutes ago (prevents false proximity for seller-delivery where seller is already near the buyer).

### Phase 2: Fix Live Activity Not Updating

**File**: `src/hooks/useLiveActivityOrchestrator.ts`

- **Fix race condition**: Ensure `flowEntriesRef` is populated BEFORE subscribing to realtime channels. Currently `fetchFlowEntries()` is async but the subscription starts immediately without awaiting it.
- **Add order-aware sync on status change**: When a realtime order update arrives, pass the full order status to `buildLiveActivityData`. The current code already does this, but the flow map may be empty. Add a fallback: if `flowEntriesRef.current` is empty when a realtime event fires, fetch entries inline before building the activity data.

**File**: `src/services/liveActivitySync.ts`

- **Force flow entry refresh on sync**: If `cachedFlowEntries` is null or empty, always fetch fresh data before building activity payloads. The current 10-minute cache expiry is too long for first-load scenarios.

### Phase 3: Fix Navigation Trap

**File**: `src/pages/OrderDetailPage.tsx`

- **Change back button to use reliable navigation**: Replace `navigate('/orders')` with a fallback pattern: try `navigate(-1)` first, but if there's no history (e.g., deep link entry), fall back to `navigate('/orders', { replace: true })`. This ensures the user can always exit.
- **Verify AppLayout showNav logic**: Ensure `showNav` is true for buyer view in all order states so the bottom nav remains accessible as an escape route.

### Phase 4: Improve Rider Icon

**File**: `src/components/delivery/DeliveryMapView.tsx`

- **Redesign the SVG rider icon** to be clearer at small sizes:
  - Larger, bolder scooter silhouette with thicker strokes
  - Bigger, more visible delivery bag with "S" logo instead of full "Sociva" text (text at 4px is illegible)
  - Higher contrast colors: solid primary fill for bag, white "S" letter
  - Increase icon size to 56x56 for better visibility
  - Add a subtle directional arrow/chevron to show heading more clearly
  - Remove overly detailed elements (wheel hub caps, thin handlebars) that become visual noise at map scale

### Summary of File Changes

| File | Change |
|------|--------|
| `supabase/functions/update-delivery-location/index.ts` | Add order status guard for proximity notifications; make proximity tiers exclusive |
| `src/hooks/useLiveActivityOrchestrator.ts` | Fix flow entries race condition; add inline fallback fetch |
| `src/services/liveActivitySync.ts` | Force fresh flow entries on first sync |
| `src/pages/OrderDetailPage.tsx` | Fix back button navigation reliability |
| `src/components/delivery/DeliveryMapView.tsx` | Redesign rider icon SVG for clarity and branding |

