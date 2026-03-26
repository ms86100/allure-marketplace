

# Buyer Journey — 10 Critical Production Bugs

## Bug 1: RecentlyViewedRow Allows Bookable Services Into Cart
**Where:** `src/components/home/RecentlyViewedRow.tsx` line 21, 55
**What:** Identical to the BuyAgainRow bug we just fixed. The query doesn't fetch `action_type`, and clicking the "+" button calls `addItem(product as any)` without any filtering. Bookable services (action_type = `book`) get added to the cart.
**Impact:** Buyer checks out a booking as a cart order → no slot reserved, no service_booking row, seller gets a nonsensical order.
**Fix:** Add `action_type` to the select query. Filter out non-cart products. The `useCart` hardening we added (DB lookup fallback) provides a safety net, but the UI should not show the "+" button on non-cart products at all.
**Dependent fix:** None — self-contained.

---

## Bug 2: ServiceBookingFlow Missing `transaction_type` on Order Insert
**Where:** `src/components/booking/ServiceBookingFlow.tsx` line 216-227
**What:** The order `.insert()` sets `order_type: 'booking'` but does NOT set `transaction_type`. Per the architecture memory, every order must persist its resolved workflow key at creation. Without it, the order detail page falls back to legacy `resolveTransactionType()` which may resolve incorrectly depending on parent_group.
**Impact:** Seller and buyer action bars may show wrong buttons. Workflow transitions may fail.
**Fix:** Add `transaction_type: 'service_booking'` to the insert payload.
**Dependent fix:** None — the `book_service_slot` RPC doesn't set it either, so the order row relies on client insert.

---

## Bug 3: SearchAutocomplete PostgREST Filter Injection
**Where:** `src/components/search/SearchAutocomplete.tsx` line 81
**What:** User-typed `trimmed` is interpolated directly into a PostgREST `.or()` filter string: `name.ilike.%${trimmed}%`. A user typing `)` or `,id.eq.` can manipulate the query to return unintended data or cause 400 errors.
**Impact:** Security risk — data leakage or error-based enumeration. App Store reviewers may flag crashes on special characters.
**Fix:** Sanitize `trimmed` by escaping PostgREST special characters (parentheses, commas, dots, percent, backslash) before interpolation. Or switch to individual `.ilike()` chained with `.or()` array syntax.
**Dependent fix:** Bug 10 (same pattern in seller search).

---

## Bug 4: Booking Flow Has No Idempotency Guard
**Where:** `src/components/booking/ServiceBookingFlow.tsx` line 147-339
**What:** `handleConfirm` uses `isSubmittingRef` (client-side lock) but there's no server-side idempotency. On a slow network, double-tap or component remount creates duplicate orders + bookings. The `book_service_slot` RPC checks for duplicate bookings by slot_id, but the order is created BEFORE the RPC call (line 214), so two concurrent requests create two orders — and the second one fails at the booking step, leaving an orphan order.
**Impact:** Orphan orders, double charges, slot count mismatch.
**Fix:** Generate an idempotency key (buyer_id + product_id + date + time) and pass it to the order insert. Add a unique constraint or use the same advisory lock pattern as `create_multi_vendor_orders`.
**Dependent fix:** Requires a DB migration to add `idempotency_key` support for booking orders, or wrap the entire flow in a single RPC.

---

## Bug 5: Search Results Can Add Unavailable Products to Cart
**Where:** `src/components/search/SearchAutocomplete.tsx` line 202-217, `src/pages/SearchPage.tsx`
**What:** When a user taps a product from autocomplete, `onSelect` opens `ProductDetailSheet`. The product object passed contains no `is_available` field (not fetched in autocomplete query). The detail sheet may render an "Add" button even for unavailable products. The cart's `addItem` does check `is_available` via a fresh products query at checkout, but the UX is broken — users think they can order it.
**Impact:** Frustration, abandoned carts, false expectations.
**Fix:** Add `is_available` to the autocomplete select query. Filter results to only `is_available = true` (already done). Ensure `ProductDetailSheet` respects the `is_available` flag on the passed product.
**Dependent fix:** None.

---

## Bug 6: Multi-Seller Cart UPI Deep Link Sends to One Seller
**Where:** `src/hooks/useCartPage.ts` line 152-154, 437-444
**What:** `acceptsUpi` checks only the first seller's UPI ID. The payment session saves only the first seller's `upi_id`. When a multi-seller cart (2+ sellers) pays via UPI deep link, the entire payment goes to seller #1. Seller #2 gets an order marked "paid" but receives zero money.
**Impact:** Seller #2 loses revenue. Complete trust destruction.
**Fix:** For UPI deep link mode, disable UPI for multi-seller carts (already partially done — multi-seller acceptsUpi checks all sellers for COD but only first for UPI). Add explicit guard: `if (sellerGroups.length > 1 && paymentMode.isUpiDeepLink) acceptsUpi = false`. Razorpay mode handles this correctly since payment goes to platform.
**Dependent fix:** The `noPaymentMethodAvailable` message in CartPage needs to be updated to explain WHY UPI is unavailable for multi-seller carts.

---

## Bug 7: Booking Flow Doesn't Validate Product Availability
**Where:** `src/components/booking/ServiceBookingFlow.tsx` line 195-210
**What:** The booking flow checks slot availability (booked_count < max_capacity) but never checks if the product itself is still `is_available = true` and `approval_status = 'approved'`. A seller could disable a product while a buyer has the booking sheet open.
**Impact:** Order created for a disabled/unapproved product. Seller confused by phantom bookings.
**Fix:** Add a product availability check alongside the fresh slot fetch (line 195). Query `products` for `is_available` and `approval_status` before proceeding.
**Dependent fix:** None.

---

## Bug 8: RecentlyViewedRow Doesn't Check Store Availability
**Where:** `src/components/home/RecentlyViewedRow.tsx` line 55
**What:** The "+" button calls `addItem` directly. The `addItem` guard in `useCart` DOES check store availability (line 286-294), so the cart will reject it with a toast. But the UI still shows the "+" button on products from closed stores, and the error toast is confusing ("This store is currently closed") when tapping a small quick-add button.
**Impact:** UX friction — users repeatedly tap "+" and get unclear error messages.
**Fix:** Fetch seller availability data (join on `seller_profiles.availability_start, availability_end, operating_days, is_available`) in the query, and visually disable/hide the add button for closed stores. Show a "Closed" overlay like `ProductListingCard` does.
**Dependent fix:** None — purely UX improvement, cart guard already protects data integrity.

---

## Bug 9: COD Orders Payment Status Inconsistency
**Where:** `src/hooks/useCartPage.ts` line 461
**What:** COD orders call `createOrdersForAllSellers('pending')` — setting `payment_status = 'pending'`. But COD doesn't have a payment confirmation step. The auto-cancel timer (3 min) from `create_multi_vendor_orders` targets pending orders. This means COD orders could get auto-cancelled before the seller even sees them if the auto-cancel cron runs.
**Impact:** Valid COD orders silently cancelled. Buyer thinks order was placed, seller never receives it.
**Fix:** Verify the auto-cancel logic in the RPC — check if it distinguishes COD from online payments. If `auto_cancel_at` is set for all pending orders regardless of payment method, COD orders need `payment_status = 'cod_pending'` or the auto-cancel must exclude COD.
**Dependent fix:** May require DB migration to the auto-cancel trigger/cron to exclude COD orders.

---

## Bug 10: Seller Search PostgREST Filter Injection
**Where:** `src/components/search/SearchAutocomplete.tsx` line 107
**What:** Same injection pattern as Bug 3. `trimmed` is interpolated into `.or(\`business_name.ilike.%${trimmed}%,...\`)`. Special characters break the filter or leak data.
**Impact:** Same as Bug 3 — security and stability risk.
**Fix:** Same sanitization approach as Bug 3. Fix both in a single pass.
**Dependent fix:** Coupled with Bug 3 — fix together.

---

## Priority Order for Implementation

| Priority | Bug | Risk Level | Effort |
|----------|-----|-----------|--------|
| 1 | Bug 3 + 10 | Security (injection) | Small — sanitize one function |
| 2 | Bug 6 | Trust destruction (seller loses money) | Small — add multi-seller UPI guard |
| 3 | Bug 2 | Workflow engine break | Tiny — add one field to insert |
| 4 | Bug 1 | Data integrity | Small — same pattern as BuyAgainRow fix |
| 5 | Bug 4 | Duplicate orders | Medium — needs DB migration |
| 6 | Bug 7 | Phantom bookings | Small — add one query |
| 7 | Bug 9 | Orders silently cancelled | Medium — needs RPC audit |
| 8 | Bug 8 | UX friction | Small — fetch + UI update |
| 9 | Bug 5 | UX confusion | Tiny — already filtered, just UI |

## Files Changed Summary

| File | Bugs Fixed |
|------|-----------|
| `src/components/home/RecentlyViewedRow.tsx` | 1, 8 |
| `src/components/booking/ServiceBookingFlow.tsx` | 2, 4, 7 |
| `src/components/search/SearchAutocomplete.tsx` | 3, 5, 10 |
| `src/hooks/useCartPage.ts` | 6, 9 |
| DB migration (if needed) | 4, 9 |

