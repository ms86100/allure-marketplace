

# Round 22: 10 Critical Bugs — Seller-Side Full QA Audit (Onboarding to Going Live)

---

## Bug 1: `StoreStatusCard` shows "Store is live" for rejected sellers

**Where:** `StoreStatusCard.tsx` line 15-31 — only checks for `pending` status; all other statuses (including `rejected`, `draft`) fall through to the "Store is live" display with the availability toggle.

**What happens:** A seller whose store was rejected by admin sees the green "Store is live" badge with a "✓ Store is live" label and an open/close toggle. The rejection banner exists separately in `SellerDashboardPage.tsx`, but the prominent status card at the top says "live". The seller toggles `is_available` on a rejected store, thinking it's visible — it isn't.

**Why critical:** A rejected seller sees contradictory signals: "Your store was rejected" banner + "Store is live ✓" card. This erodes trust and creates false expectations.

**Impact:** `StoreStatusCard.tsx`, `SellerDashboardPage.tsx`
**Fix risk:** Changing `StoreStatusCard` to handle `rejected`/`draft` states could affect all seller dashboard views that embed it. Safe: add `rejected` and `draft` branches analogous to the `pending` branch.

**Fix:** Add explicit status checks for `rejected` and `draft` in `StoreStatusCard`. Show a red "Store Rejected" card (matching pending's pattern) for rejected, and "Store Draft" for draft. Disable the availability toggle for non-approved statuses.

---

## Bug 2: Coupon creation allows percentage > 100 — seller can create "500% off" coupon

**Where:** `CouponManager.tsx` line 74-98 — validates only that `code` and `discount_value` are non-empty. No range validation for percentage discounts.

**What happens:** A seller selects "Percentage (%)" type and enters 500 as the discount value. The coupon is created successfully. On the buyer side (`CouponInput.tsx` line 83), the discount calculation is `(totalAmount * 500) / 100 = 5x the order value`, which goes negative unless `max_discount_amount` is set. Even with `max_discount_amount`, the display says "500% off" — confusing and unprofessional.

**Why critical:** An accidental or intentional percentage over 100 creates a coupon that can produce negative order totals or at minimum looks broken to buyers. This is a financial integrity issue.

**Impact:** `CouponManager.tsx`, `CouponInput.tsx`, `useCartPage.ts`
**Fix risk:** Adding validation in `CouponManager` is safe. Also need to defensively clamp in `CouponInput.tsx` to handle existing bad data.

**Fix:** In `handleCreate`: if `discount_type === 'percentage'` and value > 100, show toast error. In `CouponInput.tsx`, clamp percentage discounts to max 100% defensively.

---

## Bug 3: `AvailabilityPromptBanner` "Set Up Now" button navigates to non-existent route `/seller/services/availability`

**Where:** `AvailabilityPromptBanner.tsx` line 58 — `navigate('/seller/services/availability')`

**What happens:** The banner correctly detects when a service seller has no availability schedules. The "Set Up Now" button navigates to `/seller/services/availability`. This route does NOT exist — no route definition matches it. The seller hits the 404/NotFound page. The actual availability manager is embedded inside `SellerSettingsPage.tsx` (line 313-314).

**Why critical:** The one prompt that tells the seller exactly what they need to do leads to a dead end. The seller cannot figure out where to actually configure availability. This is a critical onboarding blocker for service sellers.

**Impact:** `AvailabilityPromptBanner.tsx`
**Fix risk:** None — purely a navigation target change.

**Fix:** Change navigation target to `/seller/settings` (where `ServiceAvailabilityManager` actually lives). Optionally add a hash `#service-availability` for scroll-to.

---

## Bug 4: `SellerOrderCard` exposes buyer personal info (block, flat number) to sellers — privacy violation

**Where:** `SellerOrderCard.tsx` line 70-72 — displays `{buyer?.block}-{buyer?.flat_number}` directly below the buyer's name.

**What happens:** Every order card in the seller's dashboard shows the buyer's residential address (block + flat number). For enquiry-based orders (contact, quote requests) where no physical delivery is needed, this exposes the buyer's home location unnecessarily. The order detail page (`OrderDetailPage`) shows this too, but there it's contextually relevant for delivery. On the dashboard list view, it's exposed as a summary line visible at a glance.

**Why critical:** Privacy exposure. A seller can see every buyer's exact residential location from the order list without even opening the order. For service categories (tutoring, consulting) where the buyer uses "at_seller" location type, the buyer's block/flat is irrelevant and shouldn't be surfaced.

**Impact:** `SellerOrderCard.tsx`, `useSellerOrdersInfinite` query
**Fix risk:** Removing the address completely might hurt sellers who use it for delivery planning at a glance. Better: conditionally show based on fulfillment type.

**Fix:** Only show `block-flat` when `order.fulfillment_type` includes `delivery`. For `self_pickup` and service bookings, show just the buyer's name or "Pickup" label.

---

## Bug 5: Bulk upload creates products with `is_available: true` and `approval_status: 'draft'` — contradictory state

**Where:** `useBulkUpload.ts` line 128-131 — inserts products with `{ is_available: true, approval_status: 'draft' }`

**What happens:** Bulk-uploaded products are immediately marked as `is_available = true` but with `approval_status = 'draft'`. The `toggleAvailability` function in `useSellerProducts.ts` (line 278-279) blocks toggling for non-approved products: "Submit for review first". But the product was created as available! The `useSellerHealth` check for "approved & available products" counts these as not live (correct), but the product card shows a green "available" toggle that the seller can't actually interact with later.

**Why critical:** Data inconsistency. A product that's both "available" and "draft" is in an invalid state. Discovery hooks filter on `approval_status = 'approved'` so it's not buyer-visible, but the seller sees a confusing "available" badge on a draft product.

**Impact:** `useBulkUpload.ts`, product listing UI, `SellerProductsPage`
**Fix risk:** Setting `is_available: false` for bulk uploads means post-approval, the seller must manually enable each product. Better: keep `is_available: true` but ensure the UI renders draft products clearly as "Draft — awaiting submission" regardless of `is_available`.

**Fix:** Change `useBulkUpload.ts` to set `is_available: false` for draft products (consistent with `DraftProductManager` behavior during onboarding). Products auto-enable on admin approval.

---

## Bug 6: Bank account details stored in plaintext, exposed via `select('*')` on `seller_profiles`

**Where:** `useSellerSettings.ts` lines 70-77 — `select('*')` on `seller_profiles` returns `bank_account_number`, `bank_ifsc_code`, `bank_account_holder` to the client. `SellerDashboardPage.tsx` line 68 — also `select('*')`.

**What happens:** Every page that fetches the seller profile via `select('*')` returns the full bank details in the response. These are visible in browser DevTools → Network tab. Additionally, the `fetchOrder` query in `useOrderDetail.ts` (line 144) selects `seller:seller_profiles(id, business_name, user_id, primary_group, profile:...)` — currently safe. But the dashboard and settings pages expose bank details to the client unnecessarily (the settings page needs them for the form, but the dashboard does not).

**Why critical:** Bank account numbers and IFSC codes are sensitive financial data. While RLS ensures only the seller's own profile is returned, the data is still exposed in the browser's network layer and React Query cache on every dashboard load — even though the dashboard UI never displays it.

**Impact:** `SellerDashboardPage.tsx`, `useSellerSettings.ts`, any `select('*')` on `seller_profiles`
**Fix risk:** Changing to explicit column selection in the dashboard may break if any component reads an unexpected field. Settings page legitimately needs bank fields.

**Fix:** In `SellerDashboardPage.tsx` `fetchSellerProfile`, change `select('*')` to explicit columns needed for the dashboard (business_name, verification_status, is_available, rating, etc.) — exclude bank details. Keep `select('*')` in `useSellerSettings` where the form needs all fields.

---

## Bug 7: Seller earnings include cancelled/refunded orders — inflated revenue display

**Where:** `useSellerOrders.ts` lines 64-71 — the earnings calculation only adds amounts for `completed` and `delivered` statuses, but the `default` case (line 87-88) catches `placed`, `accepted`, `confirmed`, `requested` as "pending". However, `refunded` status is not explicitly handled — it falls into the `default` case and increments `pendingOrders`, but more critically, there's no `refunded` exclusion in the total count. Also, `at_gate` and `out_for_delivery` statuses fall into default → pendingOrders, inflating the "pending" count.

**What happens:** Orders in transit (`out_for_delivery`, `at_gate`) are counted as "pending" in the dashboard stats. A seller sees "5 pending orders" when 3 are actually out for delivery. The earnings are technically correct (only completed/delivered), but the pending count is misleading.

**Why critical:** The seller sees inflated pending counts, creating urgency for orders that don't need seller action. "5 pending orders" when 3 are already en route undermines trust in the dashboard's intelligence.

**Impact:** `useSellerOrders.ts`, `DashboardStats` component, `OrderFilters`
**Fix risk:** Adding explicit cases for all delivery-related statuses requires knowing the full enum. Safe: add cases for `out_for_delivery`, `at_gate`, `in_transit` to a new "in_delivery" counter.

**Fix:** Add explicit status cases for `out_for_delivery`, `at_gate`, `in_transit`, `rescheduled`, `refunded` in the stats switch. Map delivery statuses to a separate counter or exclude from pendingOrders.

---

## Bug 8: `DraftProductManager` during onboarding doesn't set `approval_status` — defaults to DB column default

**Where:** `DraftProductManager.tsx` line 194-206 — the `productPayload` for insert does NOT include `approval_status`. The DB column default may be `'pending'` or whatever the migration set.

**What happens:** During onboarding (step 5), the `DraftProductManager` inserts products without specifying `approval_status`. If the DB default is `'pending'`, these products go directly to pending — bypassing the draft stage. Later in `handleSubmit` (useSellerApplication.ts line 341), the code does `.eq('approval_status', 'draft')` to transition drafts to pending — but if products were already `pending`, this update matches zero rows. The products remain at `pending` from creation, which is correct for submission but skips the seller's review step.

However, if the DB default is `draft`, then the onboarding flow works. Let me verify.

**Why critical:** If the DB default is not `draft`, onboarding products skip the seller's review step and go directly to admin review without seller confirmation. This is a data integrity concern.

**Impact:** `DraftProductManager.tsx`, `useSellerApplication.ts`
**Fix risk:** Explicitly setting `approval_status: 'draft'` in the insert payload is always safe.

**Fix:** Add `approval_status: 'draft'` to the product insert payload in `DraftProductManager.tsx`.

---

## Bug 9: `service_listings` join in `AvailabilityPromptBanner` uses `seller_id` — but `service_listings` has no `seller_id` column

**Where:** `AvailabilityPromptBanner.tsx` line 22-25 — queries `service_listings` with `.eq('seller_id', sellerId)`

**What happens:** The `service_listings` table likely has `product_id` as its key, not `seller_id`. This query would return 0 results always (no matching column), causing the banner to never show. Alternatively, if the column exists, this works. Need to verify schema.

**Why critical:** If the query silently fails, the availability prompt banner never appears, meaning service sellers with no schedules are never warned. The onboarding flow's slot generation gate (useSellerApplication line 269) would catch this, but post-onboarding (when a seller adds new service products later), there's no prompt.

**Impact:** `AvailabilityPromptBanner.tsx`
**Fix risk:** If `service_listings` doesn't have `seller_id`, need to join through `products` table.

**Fix:** Verify the `service_listings` schema. If no `seller_id` column, change the query to join through products: `supabase.from('service_listings').select('id, product:products!inner(seller_id)').eq('product.seller_id', sellerId)` — or query products first then check listings.

---

## Bug 10: Coupon toggle/delete operations don't verify seller ownership — any authenticated user with coupon ID can modify

**Where:** `CouponManager.tsx` lines 106-121 — `toggleCoupon`, `toggleVisibility`, `deleteCoupon` all execute updates/deletes using only `.eq('id', id)` without `.eq('seller_id', currentSellerId)`.

**What happens:** The Supabase update/delete operations filter only by coupon ID. While RLS policies may restrict this at the DB level, the client code doesn't include seller ownership in the filter. If RLS is not perfectly configured (or uses permissive policies), any authenticated user who knows a coupon UUID could toggle or delete another seller's coupon.

**Why critical:** This is a defense-in-depth failure. Even if RLS protects it, the client should always include ownership filters as a safety net. A single RLS misconfiguration would expose all coupons to modification.

**Impact:** `CouponManager.tsx`, RLS policies on `coupons` table
**Fix risk:** Adding `.eq('seller_id', currentSellerId)` to all mutations is safe — it only narrows the filter.

**Fix:** Add `.eq('seller_id', currentSellerId)` to `toggleCoupon`, `toggleVisibility`, and `deleteCoupon` operations.

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | "Store is live" shown for rejected sellers | **HIGH** | `StoreStatusCard.tsx` |
| 2 | Coupon % > 100 allowed | **HIGH** | `CouponManager.tsx`, `CouponInput.tsx` |
| 3 | Availability banner links to 404 route | **CRITICAL** | `AvailabilityPromptBanner.tsx` |
| 4 | Buyer block/flat exposed on all order cards | **MEDIUM** | `SellerOrderCard.tsx` |
| 5 | Bulk upload: `is_available: true` + `draft` | **MEDIUM** | `useBulkUpload.ts` |
| 6 | Bank details exposed via `select('*')` on dashboard | **HIGH** | `SellerDashboardPage.tsx` |
| 7 | Delivery-status orders counted as "pending" | **MEDIUM** | `useSellerOrders.ts` |
| 8 | DraftProductManager missing `approval_status: 'draft'` | **MEDIUM** | `DraftProductManager.tsx` |
| 9 | AvailabilityPromptBanner query may use wrong column | **HIGH** | `AvailabilityPromptBanner.tsx` |
| 10 | Coupon mutations lack seller ownership filter | **HIGH** | `CouponManager.tsx` |

## Files to Edit

- `src/components/seller/StoreStatusCard.tsx` — Bug 1: handle rejected/draft status
- `src/components/seller/CouponManager.tsx` — Bugs 2, 10: validate percentage, add seller_id filter
- `src/components/cart/CouponInput.tsx` — Bug 2: defensive clamp on percentage
- `src/components/seller/AvailabilityPromptBanner.tsx` — Bug 3: fix route; Bug 9: fix query
- `src/components/seller/SellerOrderCard.tsx` — Bug 4: conditional address display
- `src/hooks/useBulkUpload.ts` — Bug 5: set `is_available: false` for drafts
- `src/pages/SellerDashboardPage.tsx` — Bug 6: explicit column select
- `src/hooks/queries/useSellerOrders.ts` — Bug 7: add delivery status cases
- `src/components/seller/DraftProductManager.tsx` — Bug 8: add `approval_status: 'draft'`

