

# Buyer-Side Auto-Cancel Countdown Timer

## Current State
- The `UrgentOrderTimer` component exists and works, but is **only shown to sellers** (`isUrgentOrder = order?.auto_cancel_at && isSellerView`).
- Buyers see a generic "Waiting for seller to confirm..." message with no countdown.
- The `ActiveOrderStrip` on the home page shows no countdown either.
- The `auto_cancel_at` field is already fetched in order queries but unused on the buyer side.

## What Needs to Change

### 1. Order Detail Page — Show countdown to buyers
- On `OrderDetailPage`, when `isBuyerView && order.auto_cancel_at && order.status === 'placed'`, show a **buyer-variant** of the countdown timer replacing the generic "Waiting for seller" text.
- The buyer variant should have softer messaging: "Waiting for seller to respond" with a visible countdown, and "Order will be auto-cancelled if seller doesn't respond" subtext.
- Reuse the existing `UrgentOrderTimer` component but add a `variant` prop (`seller` | `buyer`) to control messaging and visual tone — buyers get a calmer blue/muted style instead of the alarm-red seller version.

### 2. ActiveOrderStrip — Show countdown for placed urgent orders
- In `ActiveOrderStrip`, fetch `auto_cancel_at` alongside existing fields.
- For orders in `placed` status with `auto_cancel_at`, replace the ETA/item-count slot with a compact live countdown (e.g., "2:34" in warning color).
- Use a lightweight `useCountdown` hook to tick every second only when there are urgent orders visible.

### 3. useOrderDetail hook — Remove seller-only gate
- Change `isUrgentOrder` from `order?.auto_cancel_at && isSellerView` to `!!order?.auto_cancel_at && isFirstFlowStep(flow, order.status)` so both views can use it.
- Add `isUrgentBuyerView` and `isUrgentSellerView` derived booleans for conditional rendering.

## Files to Edit

| File | Change |
|------|--------|
| `src/hooks/useOrderDetail.ts` | Remove `isSellerView` gate from `isUrgentOrder`; expose buyer/seller variants |
| `src/components/order/UrgentOrderTimer.tsx` | Add `variant` prop for buyer-friendly messaging and styling |
| `src/pages/OrderDetailPage.tsx` | Show timer for buyers on placed orders; replace generic waiting text with countdown |
| `src/components/home/ActiveOrderStrip.tsx` | Fetch `auto_cancel_at`; show compact countdown for urgent placed orders |

