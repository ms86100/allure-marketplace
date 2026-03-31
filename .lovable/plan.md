

# 5 Critical Silent Seller Bugs — Pre-Production Audit

## Bug 1: Dashboard Store Toggle Has No Approval Guard

**What**: `SellerDashboardPage.tsx` line 103-135 — `toggleAvailability` directly updates `is_available` without checking `verification_status`. The `useSellerSettings.ts` (line 108) correctly blocks non-approved sellers with `verification_status !== 'approved'`, but the dashboard toggle is completely unguarded. A pending/rejected seller can toggle their store "Open" from the dashboard, making them appear live to buyers before admin approval.

**Where**: `SellerDashboardPage.tsx`, `toggleAvailability` function.

**Why critical**: This bypasses the entire admin approval workflow. A rejected seller can mark themselves as open. Buyers see an unapproved store and place orders that the seller may not be equipped to fulfill. This destroys platform trust and creates admin confusion.

**Gap**: Settings page is guarded, dashboard is not — inconsistent enforcement of the same business rule across two surfaces.

**Impact analysis**:
- `SellerDashboardPage.tsx` — add `verification_status !== 'approved'` guard
- `StoreStatusCard.tsx` — already only shows toggle for approved status, but the parent can still call the unguarded function

**Risks**:
1. Sellers who are currently in `pending` state but had `is_available: true` from onboarding won't be affected — the guard only prevents toggling, not existing state.
2. The `StoreStatusCard` already hides the toggle for non-approved sellers visually, but a programmatic call or race condition could still trigger it — the backend guard is the safety net.

**Fix**: Add early return at the top of `toggleAvailability`:
```typescript
if (sellerProfile.verification_status !== 'approved') {
  toast.error('Your store must be approved before you can go live');
  return;
}
```

---

## Bug 2: Seller Order Card Missing Buyer Phone — Can't Call Customer

**What**: `useSellerOrdersInfinite` (line 153) selects `buyer:profiles!orders_buyer_id_fkey(name, block, flat_number)` — **phone is missing**. But `SellerOrderCard.tsx` has buyer typed as `{ name: string; block: string; flat_number: string }` (line 29). When the seller navigates to order detail, buyer phone IS available (fetched in `useOrderDetail.ts`). But from the dashboard list, if the seller needs to quickly call a buyer, there's no phone data. The `useOrdersList.ts` for the Orders page DOES include phone (line 42), creating inconsistency.

**Where**: `useSellerOrders.ts` line 153, `SellerOrderCard.tsx` line 29.

**Why critical**: On a busy day, a seller sees a new order on the dashboard and wants to call the buyer to confirm. They have to tap into the order detail page first. For urgent orders, this extra step wastes critical response time (especially with the 3-min auto-cancel timer).

**Gap**: `useOrdersList.ts` (Orders page) includes phone. `useSellerOrdersInfinite` (Dashboard) does not. Two views of the same data with different completeness.

**Impact analysis**:
- `useSellerOrders.ts` — add `phone` to the buyer select
- `SellerOrderCard.tsx` — add `phone?: string` to buyer interface, optionally render call button

**Risks**:
1. Adding phone to the select marginally increases payload — negligible for bounded seller order lists.
2. Exposing phone on the card could be a privacy concern — mitigate by only showing the call icon (not the number text).

**Fix**: In `useSellerOrdersInfinite` line 153, change select to include `phone`:
```
buyer:profiles!orders_buyer_id_fkey(name, block, flat_number, phone)
```
Update `SellerOrderCard` interface to add `phone?: string`.

---

## Bug 3: Earnings Count Cancelled/Returned Orders

**What**: `useSellerOrderStats` line 64-97 only counts `completed` and `delivered` statuses for earnings. However, orders with `payment_status === 'refunded'` that still have `status === 'completed'` (completed then refunded) are counted as earnings. The earnings summary on the dashboard shows inflated revenue that includes refunded amounts.

**Where**: `useSellerOrders.ts` lines 64-70, `EarningsSummary.tsx`.

**Why critical**: A seller sees ₹5,000 in earnings but only ₹3,500 was actually receivable because ₹1,500 was refunded. This creates false expectations about payouts and erodes trust when the actual payout is lower.

**Gap**: The query only fetches `status, total_amount, created_at` (line 41) but doesn't fetch `payment_status`. There's no way to exclude refunded orders from earnings calculations.

**Impact analysis**:
- `useSellerOrders.ts` — add `payment_status` to the select, exclude `refunded` from earnings
- `EarningsSummary.tsx` — no change needed (just receives correct numbers)

**Risks**:
1. Adding `payment_status` to the select increases payload slightly — negligible.
2. If `payment_status` is null for older orders (before the field existed), they'll still be counted — this is correct behavior (null = not refunded).

**Fix**: Line 41, add `payment_status` to select:
```
.select('status, total_amount, created_at, payment_status')
```
Line 65-70, add guard:
```typescript
case 'completed':
case 'delivered':
  completedOrders++;
  if (row.payment_status !== 'refunded') {
    totalEarnings += amt;
    if (isToday) todayEarnings += amt;
    if (isWeek) weekEarnings += amt;
  }
  break;
```

---

## Bug 4: Dashboard "Today" Filter Uses Local Timezone, Stats Use IST

**What**: `useSellerOrdersInfinite` line 159-160 computes "today" using `new Date()` with `setHours(0,0,0,0)` — this uses the **browser's local timezone**. But `useSellerOrderStats` line 30-31 explicitly computes IST boundaries (`Asia/Kolkata`). A seller in a different timezone (or a browser with wrong locale) sees mismatched counts: the "Today" filter badge shows 3, but clicking it shows 2 orders (or vice versa).

**Where**: `useSellerOrders.ts` line 159-160 vs line 30-31.

**Why critical**: The seller sees "Today: 5" on the stats card but when they tap the "Today" filter, only 3 orders appear. This makes the dashboard feel broken and unreliable. For a multi-timezone deployment, this is guaranteed to manifest.

**Gap**: Stats computation uses IST. Filter query uses browser timezone. Two different definitions of "today" in the same view.

**Impact analysis**:
- `useSellerOrders.ts` `useSellerOrdersInfinite` — align "today" computation with IST
- Dashboard stats and filter counts will then be consistent

**Risks**:
1. Hardcoding IST assumes all sellers are in India — if the platform expands, this needs to be configurable. For now, aligning with the existing IST convention is correct.
2. Changing the filter boundary could shift which orders appear in "today" for edge-case orders created near midnight — acceptable as it aligns with the stats count.

**Fix**: In `useSellerOrdersInfinite` line 159-160, replace:
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);
```
With IST-aware computation matching the stats query:
```typescript
const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
const istDateStr = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, '0')}-${String(nowIST.getDate()).padStart(2, '0')}`;
const todayISO = new Date(`${istDateStr}T00:00:00+05:30`).toISOString();
```

---

## Bug 5: Seller Can't See Delivery Address on Order Detail for Delivery Orders

**What**: `OrderDetailPage.tsx` line 701-703 — the delivery address display is gated by `!o.isSellerView`:
```tsx
{!o.isSellerView && (order as any).delivery_address && ...}
```
This means sellers **never** see the delivery address, even for delivery orders they need to fulfill. The seller only sees buyer's profile block/flat (line 694-700), which may differ from the actual delivery destination.

**Where**: `OrderDetailPage.tsx` line 701.

**Why critical**: For seller-delivery orders, the seller needs the exact delivery address to fulfill the order. They see "Block A, 302" from the buyer's profile, but the buyer may have specified a different address at checkout. The seller delivers to the wrong location.

**Gap**: This was added in the previous round of fixes (Bug 5 — delivery address display) but was incorrectly scoped to buyer-only view. The seller needs this information even more than the buyer.

**Impact analysis**:
- `OrderDetailPage.tsx` line 701 — remove the `!o.isSellerView` gate, or change to show for both views

**Risks**:
1. Showing delivery address to both buyer and seller on the same card could create visual clutter — mitigate by keeping it concise (single line).
2. For self-pickup orders, the delivery_address might be the buyer's home — this is already gated by `fulfillment_type === 'delivery'`, so no risk.

**Fix**: Line 701, change `!o.isSellerView` to remove the view restriction:
```tsx
{(order as any).delivery_address && ['delivery', 'seller_delivery'].includes((order as any).fulfillment_type) && (
```
This shows the delivery address to both buyer and seller for delivery orders.

---

## Summary

| # | Bug | File(s) | Severity | Effort |
|---|-----|---------|----------|--------|
| 1 | Dashboard toggle has no approval guard | SellerDashboardPage.tsx | High — bypasses admin approval | ~5 min |
| 2 | Seller order card missing buyer phone | useSellerOrders.ts, SellerOrderCard.tsx | Medium — slows response | ~10 min |
| 3 | Earnings include refunded orders | useSellerOrders.ts | Medium — financial trust | ~10 min |
| 4 | Today filter uses wrong timezone | useSellerOrders.ts | Medium — count mismatch | ~5 min |
| 5 | Seller can't see delivery address | OrderDetailPage.tsx | High — wrong delivery risk | ~2 min |

All fixes are surgical — no new features, no schema changes, no refactoring.

