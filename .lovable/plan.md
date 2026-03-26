

# Seller-Side Critical Bug Audit — 10 Production Bugs

## Bug 1: Submit-All-for-Approval Button Hidden for Approved Sellers

**Description:** Line 113 of `SellerProductsPage.tsx` — the "Submit All for Approval" banner only shows when `verification_status !== 'approved'`. Once a seller is approved, if they add new products (which default to `approval_status: 'draft'` per `useSellerProducts` line 232), there is NO bulk-submit button. They must edit each product individually and save to trigger the `pending` transition.

**Why Critical:** Approved sellers adding new products see drafts pile up with no obvious way to submit them for review. They think their products are live because their store is approved.

**Where:** `src/pages/SellerProductsPage.tsx` line 113, also line 155 (individual submit button has same guard).

**Impact Analysis:** Fix is self-contained — only affects the submit banner visibility condition.

**Interaction Behavior:** Approved seller adds 5 new products → sees them listed as "Draft" → no submit button → products are invisible to buyers indefinitely.

**Fix Risk:** Zero — removing the `verification_status !== 'approved'` guard only expands visibility of an existing button.

**Mitigation:** Change condition to `sp.products.some(p => (p as any).approval_status === 'draft')` without the seller verification gate.

---

## Bug 2: Dashboard Earnings Count `payment_pending` Orders as Revenue

**Description:** `useSellerOrders.ts` line 97-99 — the `default` case counts `payment_pending` orders as "pending seller action" and includes their `total_amount` in `totalEarnings` if they later transition to completed. But more critically, `payment_pending` orders fall into the `default` branch and increment `pendingOrders`, making the seller think they have orders waiting for action when the buyer hasn't paid yet.

**Why Critical:** Seller sees inflated pending order count, tries to find and process these orders, finds nothing actionable. Creates confusion and erodes trust in the dashboard.

**Where:** `src/hooks/queries/useSellerOrders.ts` line 64-101.

**Impact Analysis:** Only affects seller dashboard stats display. No downstream data corruption.

**Interaction Behavior:** Buyer initiates UPI payment but doesn't complete it → order stuck at `payment_pending` → seller dashboard shows it as pending → seller can't act on it.

**Fix Risk:** Zero — adding `payment_pending` to the terminal/excluded case list.

**Mitigation:** Add `case 'payment_pending':` alongside the excluded statuses block (line 84-88), so it's neither counted as pending nor as earnings.

---

## Bug 3: Seller Order Filter Misses `confirmed` Status

**Description:** `useSellerOrdersInfinite` line 168 — the "pending" filter uses `.in('status', ['placed', 'accepted'])`. Service booking orders arrive as `confirmed` (per booking lifecycle memory). These orders don't appear in any specific filter tab — they only show in "all."

**Why Critical:** Service sellers miss new confirmed bookings because they're checking the "pending" tab where their actionable orders should appear.

**Where:** `src/hooks/queries/useSellerOrders.ts` line 168.

**Impact Analysis:** Only affects the seller orders list filter. Dashboard stats already count `confirmed` via the `default` branch.

**Interaction Behavior:** Customer books a service → order created as `confirmed` → seller checks "Pending" tab → empty → seller misses the booking.

**Fix Risk:** Zero — expanding the filter array.

**Mitigation:** Add `'confirmed', 'requested', 'scheduled'` to the pending filter array.

---

## Bug 4: Slot Generation Silently Fails for Products With `is_available: false`

**Description:** `ServiceAvailabilityManager.tsx` line 158-160 — slot generation queries products with `.eq('is_available', true).eq('approval_status', 'approved')`. New service products default to `is_available: true` in the form BUT are saved with `approval_status: 'pending'` (line 232 of `useSellerProducts`). During onboarding, `DraftProductManager` saves with `is_available: false` (line 206). Either way, slot generation silently returns zero products and shows a misleading success toast.

**Why Critical:** Seller completes onboarding, clicks "Save & Generate Slots", sees "Schedule saved. Slots will be generated once your services are approved." — but even after approval, they need to manually regenerate. There's no automatic trigger after admin approval.

**Where:** `src/components/seller/ServiceAvailabilityManager.tsx` lines 154-166.

**Impact Analysis:** Affects service seller onboarding and slot availability. Fix should also generate slots on product approval (admin side), but the immediate fix is to generate slots for ALL products with service listings, regardless of approval status, since slots themselves are filtered by product approval at query time (`useServiceSlots` already checks `approval_status`).

**Interaction Behavior:** Seller completes onboarding → generates slots → admin approves products → slots were never generated for the approved products → buyer sees no available slots.

**Fix Risk:** Low — `useServiceSlots` already filters by approved products, so generating slots for unapproved products is harmless (they're invisible to buyers).

**Mitigation:** Remove the `is_available` and `approval_status` filters from the slot generation query. Slots should be pre-generated; visibility is controlled at query time.

---

## Bug 5: Earnings Page Includes Cancelled Order Payments

**Description:** `SellerEarningsPage.tsx` line 77 — `paidPayments` filter includes `payment_status === 'paid'` regardless of order status. If an order is cancelled after payment (buyer cancellation, admin cancellation), the payment record's `payment_status` remains `paid` but the order status is `cancelled`. The seller sees this as earned revenue.

**Why Critical:** Inflated earnings display. Seller bases business decisions on incorrect revenue data.

**Where:** `src/pages/SellerEarningsPage.tsx` line 77.

**Impact Analysis:** Display-only fix. No effect on actual payment flows.

**Interaction Behavior:** Buyer pays via UPI → order confirmed → buyer cancels → payment record still shows `paid` → seller earnings page counts it as revenue.

**Fix Risk:** Low — need to check that filtering by order status doesn't accidentally exclude valid completed orders.

**Mitigation:** Filter `paidPayments` to also exclude records where `order.status === 'cancelled'` or `order.status === 'returned'`.

---

## Bug 6: CouponManager Has No Validation for `discount_value` > Order Total

**Description:** `CouponManager.tsx` line 83-84 only validates percentage ≤ 100. For `discount_type: 'fixed'`, there's no upper bound validation. A seller can create a fixed-amount coupon of ₹99999. While the server-side coupon validation RPC now validates discount amounts, the seller UI allows creation of nonsensical coupons that will confuse them when applied.

**Why Critical:** Seller creates ₹5000 flat discount coupon for ₹200 products → buyer applies it → server caps discount to order total → seller confused why the coupon "didn't work as expected."

**Where:** `src/components/seller/CouponManager.tsx` line 69-112.

**Impact Analysis:** Self-contained UI validation fix. Server-side already handles the cap.

**Interaction Behavior:** Seller enters fixed discount of ₹5000, no max_discount_amount → saves successfully → buyer uses on ₹200 order → gets ₹200 discount (server-capped) → seller expected ₹5000 off.

**Fix Risk:** Zero — adding a client-side warning, not a hard block.

**Mitigation:** Add a warning toast when `discount_type === 'fixed'` and `discount_value` is unusually high (e.g., > 1000), suggesting the seller set a `max_discount_amount`.

---

## Bug 7: SellerDayAgenda Shows `requested` as Pending But Seller Can't Act

**Description:** `SellerDayAgenda.tsx` line 67 — `isPending = booking.status === 'requested'`. But service bookings are auto-confirmed per the booking lifecycle memory — they never stay at `requested`. If a future workflow introduces `requested` status for manual confirmation, the seller sees the booking in agenda but has no action button to accept it (line 96-104 only shows "View" button).

**Why Critical:** If a booking somehow enters `requested` state (workflow config change, manual DB update), the seller sees it in their daily schedule with no way to advance it. Dead-end UI.

**Where:** `src/components/seller/SellerDayAgenda.tsx` lines 67, 96-104.

**Impact Analysis:** Currently low-probability since bookings are auto-confirmed. But if workflow config changes, this becomes a blocker.

**Interaction Behavior:** Booking appears in agenda as "Requested" → seller taps "View" → goes to order detail → order detail has the correct action buttons.

**Fix Risk:** Zero — the "View" button navigates to order detail which has full action capabilities. This is a UX gap, not a data issue.

**Mitigation:** Add a quick-action "Accept" button in the agenda card for `requested` status bookings, or show a more prominent CTA.

---

## Bug 8: Multi-Store Seller Dashboard Stats Show Wrong Store's Data During Switch

**Description:** `SellerDashboardPage.tsx` line 55-61 — on store switch, `setSellerProfile(null)` and `setIsLoadingProfile(true)` are called, but `useSellerOrderStats(activeSellerId)` resolves with the new seller ID immediately. If the previous query cache is stale, the stats briefly show the old store's numbers with the new store's name, creating a data mismatch.

**Why Critical:** Multi-store seller switches from Store A (50 orders) to Store B (2 orders) → momentarily sees "50 orders" under Store B's name → thinks there's a data error.

**Where:** `src/pages/SellerDashboardPage.tsx` lines 54-62, `src/hooks/queries/useSellerOrders.ts` (React Query cache).

**Impact Analysis:** Display-only race condition. No data corruption.

**Interaction Behavior:** Switch stores → brief flash of wrong data → correct data loads.

**Fix Risk:** Zero — adding query key invalidation on switch.

**Mitigation:** In the `useEffect` that handles store switch (line 53-62), call `queryClient.removeQueries({ queryKey: ['seller-dashboard-stats'] })` and `queryClient.removeQueries({ queryKey: ['seller-orders'] })` to clear stale cache before the new fetch.

---

## Bug 9: New Product Form Defaults `is_available: true` Before Approval

**Description:** `useSellerProducts.ts` line 38 — `INITIAL_FORM` sets `is_available: true`. When saved, the product gets `approval_status: 'pending'` (line 232). The product is invisible to buyers (approval gating works), but the seller sees "In Stock" toggle as ON for a pending product. This contradicts line 279 which blocks toggling for non-approved products.

**Why Critical:** Seller adds product → sees it listed as "In Stock" → thinks it's live → wonders why no orders come in. The `is_available` toggle being ON for a pending product is misleading.

**Where:** `src/hooks/useSellerProducts.ts` line 38, `src/pages/SellerProductsPage.tsx` line 159.

**Impact Analysis:** Display-only issue. The `is_available` value is irrelevant until the product is approved. The toggle guard at line 279 prevents toggling non-approved products.

**Interaction Behavior:** Seller adds product → product appears with green "In Stock" switch → seller thinks it's visible → it's not because it's pending approval.

**Fix Risk:** Zero — changing default to `false` or hiding the toggle for non-approved products.

**Mitigation:** In `SellerProductsPage.tsx`, hide or disable the `is_available` toggle for products where `approval_status !== 'approved'`. Show "Pending Review" label instead of the toggle.

---

## Bug 10: Slot Regeneration Deletes Slots With `booked_count > 0` That Have No Active Bookings

**Description:** `ServiceAvailabilityManager.tsx` line 242-247 — candidate slots for deletion are filtered by `booked_count: 0`. But the `booked_count` is decremented when bookings are cancelled (`release_service_slot` RPC). If ALL bookings for a slot are cancelled, `booked_count` returns to 0, and the slot becomes eligible for deletion — even if there are historical `cancelled` booking records referencing it via `slot_id`. The safe-slot check (line 238) queries bookings NOT in `(cancelled,no_show)`, so cancelled bookings don't protect the slot. The slot gets deleted, and the cancelled booking record now has a dangling `slot_id` FK reference.

**Why Critical:** Orphaned FK references in `service_bookings.slot_id` → potential query failures when viewing booking history. The booking detail page may crash trying to resolve slot info.

**Where:** `src/components/seller/ServiceAvailabilityManager.tsx` lines 235-250.

**Impact Analysis:** Affects booking history display. The deleted slot leaves dangling references in cancelled bookings. Fix needs to either keep slots with ANY historical bookings or make the FK nullable/cascade.

**Interaction Behavior:** Seller regenerates slots → old slots with all-cancelled bookings are deleted → viewing cancelled booking history fails or shows missing slot data.

**Fix Risk:** Medium — if we broaden the protection, we accumulate stale slots over time. Better approach: change the safe-slot query to include ALL bookings (remove the status filter), so any slot ever referenced by a booking is preserved.

**Mitigation:** Change line 237-238 from `.not('status', 'in', '(cancelled,no_show)')` to just `.select('slot_id')` without status filtering. Any slot ever booked (even if cancelled) is preserved.

---

## Priority Order

| # | Bug | Risk | Effort |
|---|-----|------|--------|
| 1 | Bug 1 | Seller products invisible | Tiny — remove one condition |
| 2 | Bug 2 | Inflated dashboard stats | Tiny — add one case |
| 3 | Bug 3 | Missing bookings in filter | Tiny — expand array |
| 4 | Bug 4 | Zero slots after approval | Small — remove filter |
| 5 | Bug 5 | Inflated earnings | Small — add order status check |
| 6 | Bug 9 | Misleading toggle | Small — conditional UI |
| 7 | Bug 10 | Dangling FK references | Small — broaden query |
| 8 | Bug 8 | Stale cache on switch | Small — cache invalidation |
| 9 | Bug 6 | Coupon UX confusion | Tiny — add warning |
| 10 | Bug 7 | Agenda dead-end | Small — add action button |

## Files to Change

| File | Bugs |
|------|------|
| `src/pages/SellerProductsPage.tsx` | 1, 9 |
| `src/hooks/queries/useSellerOrders.ts` | 2, 3 |
| `src/components/seller/ServiceAvailabilityManager.tsx` | 4, 10 |
| `src/pages/SellerEarningsPage.tsx` | 5 |
| `src/components/seller/CouponManager.tsx` | 6 |
| `src/components/seller/SellerDayAgenda.tsx` | 7 |
| `src/pages/SellerDashboardPage.tsx` | 8 |

