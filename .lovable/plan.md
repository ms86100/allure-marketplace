

# Fix Plan: Buyer Cancel Order Failure + Navigation Lock

## Issue 1: Buyer Cancel Order — Root Cause Found

The `buyer_cancel_order` RPC function accepts exactly 3 parameters:
- `_order_id` (uuid)
- `_reason` (text)
- `_expected_status` (order_status enum, optional)

**But the frontend is passing `_buyer_id` instead of `_reason`**, which is not a valid parameter name. This causes the RPC call to fail immediately.

**Affected files:**
1. `src/components/order/OrderCancellation.tsx` (line 77-81) — passes `{ _order_id, _buyer_id, _reason }`. The `_buyer_id` param doesn't exist in the RPC. The RPC uses `auth.uid()` internally.
2. `src/components/booking/BuyerCancelBooking.tsx` (line 84-86) — same bug: passes `_buyer_id` instead of just `_order_id` and `_reason`.

**Fix:** Remove `_buyer_id` from both call sites. The correct call signature is:
```typescript
supabase.rpc('buyer_cancel_order', {
  _order_id: orderId,
  _reason: `Cancelled by buyer: ${finalReason}`,
})
```

## Issue 2: Navigation Lock on Order Summary Page

The OrderDetailPage back button (`navigate('/orders')`) uses an absolute path which should always work. However, two problems compound on mobile:

1. **Bottom nav is hidden** (`showNav={false}`) for all non-terminal orders, removing the only other navigation escape.
2. **The buyer action bar** (fixed at bottom, z-40) overlaps the bottom of the page. If the back arrow at the top is scrolled under a sticky header collision or the page errors silently, the user has zero escape routes.

**Fix:** Change the back button to navigate to the previous page when history exists, or fallback to home (`/`), not `/orders`. When the user comes from the home ActiveOrderStrip, pressing back should return them to home. Add a secondary escape: make the order header's back arrow go to `/` (home) when `referrer` was the home page, and always show bottom nav when the order is in a "placed" (waiting) status since there's no seller action bar to conflict with.

### Files to Edit

| File | Change |
|------|--------|
| `src/components/order/OrderCancellation.tsx` | Remove `_buyer_id` param from RPC call |
| `src/components/booking/BuyerCancelBooking.tsx` | Remove `_buyer_id` param from RPC call |
| `src/pages/OrderDetailPage.tsx` | Fix back navigation: use `navigate(-1)` with fallback to `navigate('/')` when no history; always show bottom nav for buyer on "placed" status |

