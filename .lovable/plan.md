

# Buyer Journey Regression & Readiness Audit — Round 2

This audit was performed after the 14-issue fix round. It covers the same buyer journey scope, focusing on new regressions introduced by fixes and previously undetected issues.

---

## Issue #1 — CategoryGroupPage: No Product Detail Sheet on Tap
**Scenario:** Buyer navigates to Home → taps "See all" on a category → taps a product card on CategoryGroupPage.
**Expected:** Product detail sheet opens (same behavior as Home page).
**Actual:** `CategoryGroupPage.tsx` line 248 passes `onNavigate={navigate}` but does NOT pass `onTap` to `ProductListingCard`. Without `onTap`, `handleCardClick` (ProductListingCard line 160-164) falls back to `onNavigate('/seller/{seller_id}')`, navigating to the seller page instead of showing the product detail.
**Failure Type:** Functional — inconsistent product tap behavior
**Root Cause:** `CategoryGroupPage` does not implement a `handleProductTap` callback or render a `ProductDetailSheet`, unlike `SearchPage` and `MarketplaceSection`.
**Proposed Fix:** Add `selectedProduct` / `detailOpen` state and a `ProductDetailSheet` to `CategoryGroupPage`, matching the pattern used in `SearchPage` and `MarketplaceSection`. Pass `onTap={handleProductTap}` to each `ProductListingCard`.

---

## Issue #2 — MarketplaceSection: `onSelectProduct` Not Passed to ProductDetailSheet
**Scenario:** Buyer opens a product detail sheet from Home page → scrolls to "Similar Products" → taps one.
**Expected:** The detail sheet updates to show the tapped similar product.
**Actual:** `MarketplaceSection.tsx` renders `<ProductDetailSheet>` at line 156 but does NOT pass `onSelectProduct`. In `ProductDetailSheet.tsx` line 163, `onSelectProduct?.(sp)` fires but there is no handler, so nothing happens. The similar products section is dead UI despite the `onClick` being added in the prior fix.
**Failure Type:** Regression — fix was incomplete
**Root Cause:** The prior fix (#4) added an `onClick` handler in `ProductDetailSheet` that calls `onSelectProduct`, but `MarketplaceSection` (the primary consumer) never passes this prop. Same issue in `SearchPage`.
**Proposed Fix:** In `MarketplaceSection.tsx`, pass `onSelectProduct={(sp) => { setSelectedProduct({...formatted sp...}); }}` to `ProductDetailSheet`. Same for `SearchPage`.

---

## Issue #3 — ReorderLastOrder Clears Entire Cart Without Warning
**Scenario:** Buyer has items in cart → visits Home page → taps "Reorder from [Seller]".
**Expected:** Items are added to existing cart, or buyer is warned the cart will be replaced.
**Actual:** `ReorderLastOrder.tsx` line 80 executes `await supabase.from('cart_items').delete().eq('user_id', user.id)` — this deletes ALL existing cart items without any confirmation dialog or warning.
**Failure Type:** Data integrity / UX — destructive action without consent
**Root Cause:** Line 80 performs a hard delete of all cart items before inserting reorder items. No confirmation step.
**Proposed Fix:** Either (a) merge reorder items into the existing cart (upsert), or (b) show an `AlertDialog` warning the buyer that their current cart will be replaced before proceeding.

---

## Issue #4 — FavoritesPage Filters Out Cross-Society Sellers
**Scenario:** Buyer enables "Nearby societies" in search → favorites a seller from another community → visits Favorites page.
**Expected:** The favorited seller appears in the list.
**Actual:** `FavoritesPage.tsx` line 41 filters favorites with `(!profile?.society_id || s.society_id === profile.society_id)`. This explicitly excludes sellers from other societies, even though the buyer intentionally favorited them via cross-society discovery.
**Failure Type:** Data inconsistency — favorites lost
**Root Cause:** Hard filter at line 41 excludes cross-society sellers.
**Proposed Fix:** Remove the `society_id` filter from line 41, or add a separate section for "Nearby Favorites" showing cross-society sellers.

---

## Issue #5 — Header Society Dropdown: ChevronDown Implies Interaction, No Action
**Scenario:** Buyer taps the society name with the chevron-down indicator in the Header.
**Expected:** A dropdown opens to show society details or switch context.
**Actual:** `Header.tsx` lines 101-111 render a `<button>` with `ChevronDown` but the `onClick` only calls `selectionChanged()` (haptic feedback). No dropdown, no navigation, no action. Dead button.
**Failure Type:** UX — misleading interactive element
**Root Cause:** The button handler only triggers haptics with no functional action.
**Proposed Fix:** Either remove the `ChevronDown` icon and change to a non-interactive `<div>`, or add a sheet/popover showing society info. For non-admin buyers, removing the chevron is the simplest fix.

---

## Issue #6 — Cart Query Key Mismatch in useAppLifecycle
**Scenario:** Buyer resumes app from background on the cart page.
**Expected:** Cart items refresh.
**Actual:** `useAppLifecycle.ts` invalidates `queryKey: ['cart-items']` but `useCart.tsx` uses `queryKey: ['cart-items', user?.id]` (line 39). The invalidation at the base key `['cart-items']` should match as a prefix, but this depends on React Query's `exact` default (which is `false`). This should work correctly. However, examining further, `useAppLifecycle` does NOT have access to `user?.id`, so if the query client has multiple keys with different user IDs cached (unlikely but possible), it would invalidate all of them — which is actually the correct behavior.
**Failure Type:** Not a bug — CONFIRMED WORKING. Skipping.

---

## Issue #7 — Payment Method Defaults to COD Even When Seller Only Accepts UPI
**Scenario:** Buyer adds product from a seller that only accepts UPI (accepts_cod=false) → goes to cart.
**Expected:** UPI should be pre-selected or COD should be disabled.
**Actual:** `useCartPage.ts` line 19 initializes `paymentMethod` to `'cod'`. If `acceptsCod` is `false`, the COD option in `PaymentMethodSelector` is visually disabled (line 67-68) but the internal state is still `'cod'`. The buyer must manually switch to UPI. If they tap "Place Order" without switching, the order goes through as COD despite the seller not accepting it — because `handlePlaceOrderInner` doesn't validate the payment method against seller capabilities.
**Failure Type:** Functional — payment method bypass
**Root Cause:** No validation that the selected `paymentMethod` matches what the seller accepts before order creation.
**Proposed Fix:** Add a guard at the top of `handlePlaceOrderInner`: if `paymentMethod === 'cod' && !acceptsCod`, show a toast and return. Additionally, auto-select UPI if COD is not accepted in the initial state.

---

## Issue #8 — Confirm Dialog Shows Empty Address for Self-Pickup
**Scenario:** Buyer selects "Self Pickup" → taps "Place Order" → Confirm dialog opens.
**Expected:** Shows pickup location clearly.
**Actual:** `CartPage.tsx` line 228 renders the fulfillment info in the confirm dialog. For `self_pickup`, it shows `{c.sellerGroups[0]?.sellerName || 'Seller'}`. For `delivery`, it renders `${c.profile?.block}, ${c.profile?.flat_number}`. If the buyer's profile has no block/flat, this renders `undefined, undefined`.
**Failure Type:** UX — displays raw undefined values
**Root Cause:** Template literal doesn't handle null/undefined profile fields.
**Proposed Fix:** Use the same pattern as the address card: `[c.profile?.block, c.profile?.flat_number].filter(Boolean).join(', ') || 'Not set'`.

---

## Issue #9 — OrderDetailPage: Seller Phone Link May Be Null
**Scenario:** Buyer views an order detail → taps the phone icon to call the seller.
**Expected:** Opens phone dialer with seller's number.
**Actual:** `OrderDetailPage.tsx` line 135 renders `<a href={tel:${...sellerProfile?.phone}}>`. If `sellerProfile` is null (which happens when the seller profile join fails or the seller doesn't have phone set), the href becomes `tel:undefined`, which opens the dialer with "undefined" as the number.
**Failure Type:** Functional — broken phone link
**Root Cause:** No null check on phone number before rendering the tel link.
**Proposed Fix:** Conditionally render the phone button only when `sellerProfile?.phone` or `buyer?.phone` is truthy.

---

## Issue #10 — SearchPage: showCart={false} but FloatingCartBar Still Hides Correctly
**Scenario:** Buyer navigates to SearchPage which sets `showCart={false}`.
**Expected:** No FloatingCartBar shown on search page.
**Actual:** After the prior fix (#14), `AppLayout` now conditionally renders `FloatingCartBar` based on `showCart`. SearchPage passes `showCart={false}`. This is CONFIRMED WORKING.
**Failure Type:** Not a bug — CONFIRMED FIXED. Skipping.

---

## Issue #11 — CategoryGroupPage Shows "Become a Seller" CTA to Buyers
**Scenario:** Buyer browses a category with no products → sees "No items found" empty state.
**Expected:** Appropriate empty state for a buyer.
**Actual:** `CategoryGroupPage.tsx` line 264 shows a "Become a Seller" button in the empty state. This is confusing for buyers who are just browsing. It should only appear if relevant context warrants it (e.g., the user is already on a seller onboarding path).
**Failure Type:** UX — inappropriate CTA for buyer context
**Root Cause:** Empty state copy targets sellers rather than buyers.
**Proposed Fix:** Change the CTA to "Browse other categories" or "Go back to Home", or conditionally show "Become a Seller" only if the user is not already a seller.

---

## Issue #12 — Order Detail: `payment_type` Used Instead of `payment_method`
**Scenario:** Buyer views order detail for a COD order.
**Expected:** Shows "Cash on Delivery" correctly.
**Actual:** `OrderDetailPage.tsx` line 100 checks `order.payment_type === 'cod'`. The database field used in `useCartPage` is `payment_method` (line 62). If the orders table column is named `payment_method` but the code reads `payment_type`, this could show incorrect payment info. Need to verify the actual DB column name.
**Failure Type:** Potential data inconsistency
**Root Cause:** Possible field name mismatch between what's written (payment_method) and what's read (payment_type).
**Proposed Fix:** Verify the actual column name in the orders table schema. If `payment_method`, change `order.payment_type` to `order.payment_method` in OrderDetailPage.

---

## Issue #13 — No Loading/Disabled State on Reorder Button During Processing
**Scenario:** Buyer taps "Reorder" on an order card or the home page reorder strip.
**Expected:** Button shows loading state to prevent double-tap.
**Actual:** `ReorderLastOrder.tsx` correctly disables the button with `isLoading` state. However, `ReorderButton` (used in OrderCard and OrderDetailPage) — need to verify it also has loading protection. The `ReorderButton` is wrapped in `onClick={(e) => e.preventDefault()}` at `OrdersPage.tsx` line 83, which prevents navigation from the Link, but the reorder button itself needs independent loading state.
**Failure Type:** Potential — needs verification
**Root Cause:** If `ReorderButton` doesn't manage its own loading state, double-taps could create duplicate cart entries.
**Proposed Fix:** Ensure `ReorderButton` has an internal `isLoading` state that disables the button during the async operation.

---

## Issue #14 — Pre-checkout Validation Swallows Errors
**Scenario:** Buyer places order → pre-checkout validation (product availability check) fails due to network error.
**Expected:** Order placement is blocked with a clear error message.
**Actual:** `useCartPage.ts` lines 129-131: the `catch` block only logs the error (`console.error`) but does NOT return or block the order. Execution continues to the COD/UPI order creation logic, meaning orders can be placed even if the availability check failed entirely.
**Failure Type:** Functional — validation bypass on network error
**Root Cause:** Missing `return` or `setIsPlacingOrder(false)` in the catch block of the pre-checkout validation.
**Proposed Fix:** Add `setIsPlacingOrder(false); return;` in the catch block at line 130, or at minimum show a toast warning the buyer that validation could not be completed and ask them to retry.

---

## Priority Matrix

| Priority | Issues |
|----------|--------|
| **P0 — Blocks correctness** | #7 (payment method bypass), #14 (validation swallowed) |
| **P1 — Functional gaps** | #1 (no detail sheet on category page), #2 (similar products dead), #3 (reorder clears cart), #9 (null phone link) |
| **P2 — UX issues** | #4 (favorites filter), #5 (dead society button), #8 (undefined in confirm dialog), #11 (wrong CTA), #12 (payment_type field) |

