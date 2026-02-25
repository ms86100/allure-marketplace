

# Buyer Journey Regression & Readiness Audit

---

## Summary

After a thorough code-level audit of every buyer-facing flow (home, discovery, product detail, cart, checkout, payment, orders, notifications), I identified **14 issues** across functional, UX, and data integrity categories. None require new features -- all are corrections to existing behavior.

---

## Issue #1
**Scenario:** Buyer places a COD order successfully. Cart is not cleared after navigation.
**Expected:** Cart should be empty after successful order placement.
**Actual:** `useCartPage.handlePlaceOrderInner` calls `await refresh()` (which only invalidates the query) but never calls `clearCart()`. The `create_multi_vendor_orders` RPC may delete cart items server-side, but there is no guarantee. If the RPC does not clear the cart, the buyer sees stale items.
**Failure Type:** Functional
**Root Cause:** Missing explicit `clearCart()` call after successful COD order creation (line 151 of `useCartPage.ts`). The `refresh()` call only invalidates the cache -- if the server-side RPC does not delete cart_items rows, items persist.
**Proposed Fix:** Add `await clearCart()` after `await refresh()` in the COD success path (line 151) and in `handleRazorpaySuccess` (line 183). Alternatively, confirm the `create_multi_vendor_orders` RPC deletes cart items and rely on `refresh()`.

---

## Issue #2
**Scenario:** Buyer selects "Pay Online (UPI)" for a multi-seller cart with 2+ sellers.
**Expected:** Either each seller gets a separate Razorpay order, or the user is informed that online payment is only available for single-seller carts.
**Actual:** `RazorpayCheckout` receives `orderId={c.pendingOrderIds[0]}` and `sellerId={c.sellerGroups[0]?.sellerId}` -- only the first order/seller. The second seller's order remains unpaid with `payment_status = 'pending'` forever.
**Failure Type:** Functional -- payment correctness
**Root Cause:** `CartPage.tsx` line 237 only passes the first order ID to Razorpay. Multi-seller UPI payment is incomplete.
**Proposed Fix:** Either (a) iterate through each order and present sequential Razorpay checkouts, or (b) disable UPI for multi-seller carts and show an informational message, similar to how coupons are disabled for multi-seller carts (line 153-154 of CartPage).

---

## Issue #3
**Scenario:** Buyer adds a product with `approval_status = 'pending'` to the cart via Home page product listings.
**Expected:** Only approved products should be purchasable.
**Actual:** The `useProductsByCategory` query likely filters `approval_status = 'approved'`, but the pre-checkout validation (line 110-112 of `useCartPage.ts`) correctly rejects pending products. However, if a product's status changes to pending AFTER being added to cart, the buyer gets a confusing error at checkout time instead of being warned earlier.
**Failure Type:** UX
**Root Cause:** No real-time or periodic validation of cart item availability.
**Proposed Fix:** Add a visual indicator on cart items whose products are no longer available/approved, detected at cart render time via the existing query data.

---

## Issue #4
**Scenario:** Buyer taps on a similar product in the `ProductDetailSheet` similar products row.
**Expected:** The detail sheet should update to show the tapped similar product.
**Actual:** Similar products are rendered as plain `<div>` elements with no click handler. They are not tappable. Dead UI.
**Failure Type:** Functional -- dead CTA
**Root Cause:** `ProductDetailSheet.tsx` lines 165-174 render similar products without any `onClick` handler.
**Proposed Fix:** Add an `onClick` handler to each similar product that updates the `product` prop or opens a new detail sheet for that product.

---

## Issue #5
**Scenario:** Buyer views product detail sheet and sees image pagination dots (3 dots).
**Expected:** Multiple product images with swipe navigation, or a single image with no dots.
**Actual:** The dots are hardcoded (lines 67-72 of `ProductDetailSheet.tsx`) -- always showing 3 dots regardless of actual image count. There is only ever 1 image. This is misleading.
**Failure Type:** UX -- misleading UI
**Root Cause:** Hardcoded pagination indicators with no carousel logic.
**Proposed Fix:** Remove the pagination dots entirely since products only have a single `image_url` field, or conditionally render them only when multiple images exist.

---

## Issue #6
**Scenario:** Buyer views the address section on the checkout page with no block/flat set in profile.
**Expected:** Graceful handling or prompt to add address.
**Actual:** `CartPage.tsx` line 175 renders `{c.profile?.name} — ` followed by empty string from `[c.profile?.block, c.profile?.flat_number].filter(Boolean).join(', ')`. The delivery address in the order will also be empty (line 59 of `useCartPage.ts`), leading to orders with no delivery information.
**Failure Type:** Functional -- data integrity
**Root Cause:** No validation that the buyer has a complete delivery address before allowing order placement.
**Proposed Fix:** Add a guard in `handlePlaceOrderInner` that checks for non-empty `profile.block` and `profile.flat_number` when `fulfillmentType === 'delivery'`, and show a toast directing the buyer to update their profile.

---

## Issue #7
**Scenario:** Buyer taps the address card (ChevronRight indicator) on the checkout page.
**Expected:** Opens an address edit sheet or navigates to profile to update address.
**Actual:** The address card (lines 169-179 of CartPage) has a `ChevronRight` icon suggesting it is tappable, but there is no `onClick` handler or `Link` wrapper. It is a non-interactive element styled as interactive.
**Failure Type:** UX -- misleading CTA
**Root Cause:** Missing navigation/click handler on the address card.
**Proposed Fix:** Either wrap the address card in a `Link to="/profile"` or remove the `ChevronRight` icon to avoid implying interactivity.

---

## Issue #8
**Scenario:** Buyer resumes the app from background (iOS/Android) while on the cart page.
**Expected:** Cart data refreshes to reflect any server-side changes.
**Actual:** `useAppLifecycle.ts` invalidates `cart-count` but does NOT invalidate the main `cart-items` query key. The cart count badge updates, but the actual cart page data may be stale.
**Failure Type:** Real-time issue -- stale data on resume
**Root Cause:** `useAppLifecycle.ts` line 14 invalidates `['cart-count']` but not `['cart-items']`.
**Proposed Fix:** Add `queryClient.invalidateQueries({ queryKey: ['cart-items'] })` to the `appStateChange` handler in `useAppLifecycle.ts`.

---

## Issue #9
**Scenario:** Buyer's `FeaturedBanners` carousel auto-scrolls. Buyer manually scrolls and releases.
**Expected:** Auto-scroll pauses or resets after manual interaction.
**Actual:** The auto-scroll interval (line 55-58 of `FeaturedBanners.tsx`) runs continuously at 4s. After manual scroll sets `activeIndex` via the scroll handler, the interval immediately overrides it on the next tick, causing a "fighting" effect where the carousel jumps.
**Failure Type:** UX regression
**Root Cause:** Auto-scroll interval does not pause on user interaction.
**Proposed Fix:** Clear the interval on user touch/scroll start, and restart it after a delay (e.g., 8s) after the last user interaction.

---

## Issue #10
**Scenario:** Buyer taps "Neighborhood Guarantee" text at the bottom of the checkout page.
**Expected:** Readable, meaningful text about the guarantee.
**Actual:** `CartPage.tsx` lines 192-196 contain broken string manipulation logic. The `.split()` / `.reduce()` chain does not produce the intended bold-text result. Instead it falls back to the raw label string, which may contain a placeholder pattern like `{Neighborhood Guarantee}` that renders literally.
**Failure Type:** UX -- broken copy rendering
**Root Cause:** Complex string manipulation attempting to emulate `dangerouslySetInnerHTML` without actually doing it.
**Proposed Fix:** Simplify by rendering the label as plain text, or use a proper React-based approach to bold the guarantee name (e.g., split the string and wrap the guarantee name in a `<span className="font-semibold">`).

---

## Issue #11
**Scenario:** Buyer taps a notification in NotificationInboxPage that has a `reference_path`.
**Expected:** Navigates to the referenced page (e.g., order detail).
**Actual:** The notification is marked as read and navigation occurs, but no loading indicator is shown. If the `reference_path` is invalid or points to a non-existent route, the buyer sees a 404 page with no way to understand what happened.
**Failure Type:** UX -- silent failure
**Root Cause:** No validation of `reference_path` before navigation.
**Proposed Fix:** Wrap navigation in a try-catch or validate that the path starts with a known route prefix before calling `navigate()`.

---

## Issue #12
**Scenario:** Buyer places a UPI order, payment fails, and taps "Cancel" on the failure screen.
**Expected:** The pending unpaid order is cancelled or clearly shown as unpaid in the orders list.
**Actual:** `handleRazorpayFailed` (line 188-192 of `useCartPage.ts`) clears `pendingOrderIds` and shows a toast, but does NOT cancel the order in the database. The order remains in `status = 'placed'` with `payment_status = 'pending'` indefinitely, until the auto-cancel cron picks it up (which could be hours later).
**Failure Type:** Functional -- orphaned order
**Root Cause:** No immediate order cancellation on payment failure.
**Proposed Fix:** Call an update to set `status = 'cancelled'` for the pending order IDs when the buyer explicitly cancels after payment failure. Alternatively, set a shorter auto-cancel window for UPI orders specifically.

---

## Issue #13
**Scenario:** Buyer views the Orders page and switches to "Received" tab (if they are also a seller).
**Expected:** Only seller-view concerns.
**Actual:** The seller tab uses `currentSellerId` from `useAuth()`. If a user has multiple seller profiles, only the "current" one is shown. There is no switcher on this page. The buyer-who-is-also-a-seller may miss orders from their other store.
**Failure Type:** Data inconsistency
**Root Cause:** `OrdersPage.tsx` line 211 uses `currentSellerId` without providing a seller switcher.
**Proposed Fix:** Either show orders from ALL seller profiles, or add the `SellerSwitcher` component to the "Received" tab header.

---

## Issue #14
**Scenario:** Buyer's `FloatingCartBar` overlaps with the `BottomNav` on pages where both are visible.
**Expected:** The floating cart bar sits above the bottom nav without overlap.
**Actual:** `FloatingCartBar.tsx` positions itself at `bottom-[calc(4rem+env(safe-area-inset-bottom))]` (line 26). `BottomNav.tsx` has `pb-[env(safe-area-inset-bottom)]` plus the nav height. On devices where the actual safe area is larger than expected, or with certain font scaling, there can be slight overlap or a gap. Additionally, `AppLayout.tsx` always renders `FloatingCartBar` (line 41) even when `showCart={false}` is passed -- the cart bar renders regardless because `FloatingCartBar` manages its own visibility, but `AppLayout` renders it unconditionally outside the `showCart` guard.
**Failure Type:** UX -- layout inconsistency
**Root Cause:** `FloatingCartBar` is always rendered in `AppLayout` regardless of `showCart` prop.
**Proposed Fix:** Conditionally render `FloatingCartBar` in `AppLayout` based on the `showCart` prop: `{showCart && <FloatingCartBar />}`.

---

## Priority Matrix

| Priority | Issues |
|----------|--------|
| **P0 - Blocks payment** | #2 (multi-seller UPI), #12 (orphaned order on UPI failure) |
| **P1 - Data integrity** | #1 (cart not cleared), #6 (empty delivery address), #8 (stale cart on resume) |
| **P2 - UX regressions** | #4 (dead similar products), #5 (fake pagination dots), #7 (dead address CTA), #9 (carousel fighting), #10 (broken guarantee text), #14 (FloatingCartBar always visible) |
| **P3 - Minor** | #3 (pending product in cart), #11 (invalid notification path), #13 (missing seller switcher on orders) |

