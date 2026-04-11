

# Fix Plan: 4 Critical UX Issues

## Issues Identified

1. **Google Maps "can't load correctly"** — The `useGoogleMaps` hook uses a hardcoded fallback API key that likely has billing/restrictions issues. The map loads but shows the Google error overlay. No graceful fallback in the UI when this happens (the error is only caught if the script itself fails to load, not if Google shows its own error dialog).

2. **No OTP section for order completion** — The OTP flow for seller delivery completion depends on `getStepOtpType()` returning `'delivery'` from the `category_status_flows` table's `otp_type` column for the terminal step. If the flow's terminal step doesn't have `otp_type = 'delivery'` set in DB, the seller gets a plain "Complete Order" button that advances without OTP. The `forceDeliveryOtp` fallback (line 867) only fires when `isDeliveryOrder && nextStep?.is_terminal && nextStep?.is_success` AND there's a `deliveryAssignmentId` — if there's no delivery assignment (seller_delivery without platform assignment), OTP is skipped entirely. On the buyer side, the OTP card only shows when `buyerOtp` is set from `delivery_assignments.delivery_code`, which requires a delivery assignment to exist.

3. **Spinner after order completion (seller side)** — When the order reaches terminal status, `hasSellerActionBar` becomes false (line 302: `!isTerminalStatus(...)` check). However, there's a timing issue: when the seller clicks the action button, `o.isUpdating` becomes true, the status updates via realtime, but the action bar may briefly show the spinner state at line 856-858 (`!o.nextStatus` shows a Loader2 spinner + context message). The `getSellerContextMessage()` returns "Order completed successfully" for `phase === 'delivered'`. So the seller sees a **spinning loader** with "Order completed successfully" — contradictory UX.

4. **Unintuitive order progress bar** — The seller sees a segmented bar (lines 365-391) with no step labels except the current one. The buyer sees a 3-node progress (Seller Name → Rider → You) which is too generic and doesn't convey meaningful status.

---

## Fix Plan

### Fix 1: Google Maps Graceful Degradation
**Files**: `src/components/delivery/DeliveryMapView.tsx`, `src/hooks/useGoogleMaps.ts`

- Add a `google.maps.event.addListenerOnce(map, 'tilesloaded', ...)` check + a `MutationObserver` or timeout to detect Google's "can't load correctly" error dialog overlay
- When detected, show a clean fallback card with: address text, distance, ETA (from OSRM which works independently), and a "Open in Google Maps" button linking to `google.com/maps/dir/...`
- Also handle the case where the API key is invalid by catching the `gm_authFailure` global callback Google fires
- Remove the hardcoded fallback key from `useGoogleMaps.ts` — if DB key doesn't exist, show the fallback card instead of loading with a broken key

### Fix 2: OTP for Order Completion (Both Sides)
**Files**: `src/pages/OrderDetailPage.tsx`

- For **seller-delivery orders** (no platform delivery assignment): When the terminal step requires completion verification, use `GenericOtpCard` (buyer side) + `GenericOtpDialog` (seller side) instead of relying solely on `DeliveryCompletionOtpDialog` which needs a `deliveryAssignmentId`
- Fix the `forceDeliveryOtp` logic (line 867) to also check for seller_delivery without assignment → fall back to generic OTP
- For **buyer side**: When `buyerOtp` is null (no delivery assignment) but the next step is terminal, show a `GenericOtpCard` so the buyer always has a verification code to share
- This ensures OTP verification works for ALL delivery types, not just platform-managed delivery

### Fix 3: Remove Spinner on Completed Orders (Seller)
**Files**: `src/pages/OrderDetailPage.tsx`

- The `!o.nextStatus` branch inside the seller action bar (line 856) shows a spinner. This should never show "Order completed successfully" with a spinner — that's contradictory
- Fix: When `displayStatus.phase === 'delivered'` or `isSuccessfulTerminal(o.flow, order.status)`, the action bar should show a static success state (checkmark + "Order Completed") instead of a spinner
- Better yet: the `hasSellerActionBar` check at line 302 already hides the bar at terminal — the issue is a **race condition** where realtime updates the order status but `isTerminalStatus` hasn't re-evaluated yet. Add `o.isUpdating` guard: if updating and nextStatus is null, show "Updating..." not a spinner with completion text

### Fix 4: Redesign Order Progress (Swiggy/Zomato Style)
**Files**: `src/pages/OrderDetailPage.tsx`, `src/components/order/LiveActivityCard.tsx`

**Seller side** — Replace the segmented bar with a **vertical stepper timeline**:
- Each step shows: icon + label + timestamp (if completed)
- Current step: highlighted with accent color + "Current" badge
- Completed steps: checkmark + muted
- Future steps: dimmed
- Uses `o.flow` step labels from DB (already available via `o.getFlowStepLabel`)

**Buyer side** — Replace the 3-node "Seller → Rider → You" with a **Swiggy-style vertical timeline**:
- Shows actual status labels from DB flow (e.g., "Order Confirmed", "Preparing", "Out for Delivery", "Delivered")
- Each step: icon + label + hint text from `buyer_hint` field
- Active step: animated pulse + bold
- ETA shown at active step
- This replaces `LiveActivityCard`'s 3-node progress with a richer vertical layout while keeping the status text + ETA header

---

## Technical Details

### Files Modified
| File | Change |
|------|--------|
| `src/hooks/useGoogleMaps.ts` | Remove hardcoded fallback key, add `gm_authFailure` detection |
| `src/components/delivery/DeliveryMapView.tsx` | Add auth failure detection, show fallback card with OSRM data |
| `src/pages/OrderDetailPage.tsx` | Fix OTP flow for seller-delivery, fix spinner race condition, replace seller progress bar with vertical stepper |
| `src/components/order/LiveActivityCard.tsx` | Replace 3-node horizontal progress with vertical Swiggy-style timeline using DB flow steps |

### No DB changes needed — all fixes use existing `category_status_flows` data.

