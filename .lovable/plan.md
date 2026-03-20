

# Root Cause: DeliveryArrivalOverlay Blocks Entire App Navigation

## The Problem

The `DeliveryArrivalOverlay` component renders a **full-screen fixed overlay** (`fixed inset-0 z-[60]`) with a semi-transparent backdrop that captures ALL click events. Two compounding issues make this a navigation lock:

1. **`showArrivalOverlay` does NOT check terminal status**: Line 180 only checks `o.isBuyerView && deliveryTracking.distance < threshold`. After delivery completes, `deliveryTracking` retains stale distance/status data from its polling/subscription, so the overlay stays visible even on a completed order.

2. **`onDismiss` is a no-op**: Line 576 passes `onDismiss={() => {}}`. The overlay's internal dismiss resets `dismissed` to `false` whenever `isImminent` changes (line 52-54), so even if the user dismisses it, the next polling tick re-shows it. The full-screen backdrop (`bg-background/80 backdrop-blur-sm`) blocks all touch targets including BottomNav and the back button.

3. **Stale `deliveryTracking` data**: The `useDeliveryTracking` hook continues polling/subscribing to the assignment even after the order is terminal, keeping `distance` and `status` populated with last-known values.

## Fix (2 files)

### 1. `src/pages/OrderDetailPage.tsx` — Gate overlay on non-terminal status
Add terminal status check to `showArrivalOverlay`:
```typescript
const showArrivalOverlay = o.isBuyerView 
  && !isTerminalStatus(o.flow, order.status) 
  && deliveryAssignmentId 
  && deliveryTracking.riderLocation 
  && deliveryTracking.distance != null 
  && deliveryTracking.distance < trackingConfig.arrival_overlay_distance_meters;
```

### 2. `src/components/order/DeliveryArrivalOverlay.tsx` — Fix backdrop click-through and dismiss persistence
- Make the backdrop area pass clicks through so navigation is never fully blocked
- Use a dismiss flag that persists for the session (not reset on every `isImminent` flicker)
- Add `pointer-events-none` to the backdrop wrapper, `pointer-events-auto` only on the card itself

## Expected Result
- Overlay disappears immediately when order reaches terminal status (delivered/completed/cancelled)
- Even while visible, tapping outside the card (e.g., nav buttons) works normally
- Dismissing the overlay stays dismissed for that viewing session

