

## Fix: Refund status not updating after seller approval

### Problems
1. **Seller sees stale "Refund Requested"** — After approving, `SellerRefundActions` re-fetches but doesn't show the updated status (approved/rejected). It just hides the action buttons while keeping the warning styling.
2. **Buyer-side `RefundRequestCard` also renders on seller view** — Both cards appear on the order detail page for the seller, with the buyer card showing stale "Refund Requested" because it has its own independent fetch that doesn't re-run after seller action.
3. **No visual confirmation of approval** — The seller has no clear feedback that the refund was approved beyond the toast message.

### Fix Plan

**1. `SellerRefundActions.tsx` — Show resolved status clearly**
- When `refundStatus` is `approved`, show a green "Approved" badge instead of the warning styling
- When `rejected`, show a red "Rejected" badge with the rejection reason
- Change the card border/background color based on status (green for approved, red for rejected, warning for pending)
- Only show the action buttons and 48-hour warning when status is `requested`

**2. `OrderDetailPage.tsx` — Fix duplicate rendering and stale data**
- Hide `RefundRequestCard` from seller view when `SellerRefundSection` is already showing (or vice versa) to avoid duplicate cards
- Pass a refresh key or callback so that when seller approves/rejects, the buyer-side card also updates
- Alternative: only show `SellerRefundSection` for sellers, only show `RefundRequestCard` for buyers (cleaner separation)

**3. `SellerRefundSection` — Trigger full page data refresh**
- After `fetchRefund()` completes in `onActionComplete`, ensure the parent component re-renders with fresh data so both cards reflect the new status

### Files to modify
- `src/components/refund/SellerRefundActions.tsx` — Status-aware rendering with approved/rejected visual states
- `src/pages/OrderDetailPage.tsx` — Remove duplicate refund card for seller view, ensure data consistency after actions

