

# Round 17: 5 Critical Bugs — Buyer Browsing & Location-Based Discovery

## Bug 1: `operating_days` missing from `search_sellers_by_location` RPC — stores appear open on their off-days

**Where:** `search_sellers_by_location` SQL function (returns `availability_start`, `availability_end` but NOT `operating_days`), consumed by every discovery hook (`useNearbyProducts`, `useTrendingProducts`, `usePopularProducts`, `useProductsByCategory`)

**What happens:** All discovery hooks map `seller.operating_days` to `seller_operating_days` on the product object. But the RPC never returns `operating_days` — so `seller.operating_days` is always `undefined`, which becomes `null`. The `computeStoreStatus` function receives `null` for `operatingDays` and skips the day-of-week check entirely (line 28 of `store-availability.ts`). A bakery that only operates Mon-Fri appears "Open" on Saturday and Sunday. The buyer can add items to cart and attempt checkout, only to be blocked by the server-side `create_multi_vendor_orders` RPC which does check operating days.

**Why critical:** A buyer sees an "Open" store, adds items, reaches checkout, and gets rejected. This is a trust-breaking dead end. The store should show "Closed today" with a grey overlay on the product card.

**Impact analysis:**
- `search_sellers_by_location` RPC: add `sp.operating_days` to SELECT + RETURNS TABLE
- No client code changes needed — hooks already map `seller.operating_days`
- Risk 1: Altering the RPC return type is a schema change; the `types.ts` auto-gen must pick it up. Since we use `as any` casts, this is safe.
- Risk 2: Stores with no operating_days set (null) will continue to show as "open" — this is correct (no restriction = always open).

**Fix:** Add `operating_days text[]` to the RETURNS TABLE and `sp.operating_days` to the SELECT in the RPC.

---

## Bug 2: `seller_name` falls back to hardcoded `'Seller'` — violates no-dummy-data policy

**Where:** `useNearbyProducts.ts` line 55, `useTrendingProducts.ts` line 41, `usePopularProducts.ts` lines 41/128, `useProductsByCategory.ts` line 70

**What happens:** All discovery hooks use `seller.business_name || 'Seller'` as fallback. Per the project's strict "no dummy data" policy (see memory), hardcoded fallbacks like 'Seller' or 'Local Seller' are prohibited. If a seller has no `business_name` (e.g., draft data, migration gap), the product card shows "Seller" — which looks generic and fake. The `useSearchPage.ts` hook correctly uses `|| ''` (line 67), but the four discovery hooks don't follow this pattern.

**Why critical:** Showing "Seller" as a store name on a product card in a real marketplace feels like test data leaked into production. It undermines the trust and professionalism of the entire marketplace.

**Impact analysis:**
- 4 discovery hooks modified (string change only)
- Risk 1: Empty `seller_name` may cause the `<Store>` icon + name row in `ProductGridCard` to render an empty line. But line 98 of `ProductGridCard` already guards: `{product.seller_name && (...)}` — so empty string hides the row correctly.
- Risk 2: None.

**Fix:** Change `|| 'Seller'` to `|| ''` in all 4 hooks, matching `useSearchPage.ts`.

---

## Bug 3: `is_available: true` hardcoded on all discovery products — unavailable products appear orderable

**Where:** `useNearbyProducts.ts` line 46, `useTrendingProducts.ts` line 39, `usePopularProducts.ts` lines 43/130, `useProductsByCategory.ts` line 72

**What happens:** Every discovery hook hardcodes `is_available: true` when mapping RPC results to `ProductWithSeller`. The RPC already filters for `p.is_available = true` in the `matching_products` subquery, so this *appears* safe. BUT the RPC also returns products from the JSON subquery which was computed at query time. If a seller marks a product unavailable between the discovery fetch (cached for 5-10 minutes via staleTime) and when the buyer taps it, the cached product still has `is_available: true`.

More critically, the `matching_products` JSON doesn't include `is_available` at all — so even if we wanted to read the real value, it's not there. The product detail sheet then fetches fresh data, but the listing card shows it as available.

**Why critical:** A buyer sees an available product, taps "Add", and the cart's `addItem` does a fresh seller availability check but NOT a product availability check. The product gets added to cart. At checkout, the pre-validation catches it (line 311 of `useCartPage.ts`), but this is a late, jarring rejection.

**Impact analysis:**
- `search_sellers_by_location` RPC: add `'is_available', p.is_available` to the `json_build_object` in matching_products
- Discovery hooks: change `is_available: true` to `is_available: p.is_available ?? true`
- Risk 1: Including `is_available` in JSON increases payload size negligibly.
- Risk 2: Products marked unavailable between RPC call and render will still show briefly due to staleTime. This is inherent to caching and acceptable — the fix just ensures the initial state is accurate.

**Fix:** Add `is_available` to the RPC's product JSON, then use the real value in hooks.

---

## Bug 4: Browsing location persists across sessions for logged-out users — stale location shows wrong sellers

**Where:** `BrowsingLocationContext.tsx` line 43, `loadFromStorage()`

**What happens:** When a user sets a GPS-based browsing location, it's saved to `localStorage` under `sociva_browsing_location`. This persists indefinitely. If the user logs out, the override remains. If a different user logs in on the same device (shared family phone — common in India), they see sellers from the previous user's GPS location, not their own society or saved addresses. The fallback chain (line 135-161) checks override first, so the stale GPS location takes priority over the new user's address/society.

The `loadFromStorage` at line 38-46 checks for `lat`, `lng`, and `label` but doesn't check for a `user_id` or session match.

**Why critical:** On shared devices (common in Indian households), a buyer opens the app and sees "Browsing near [previous user's location]" with sellers 10km away. They don't understand why they can't find their local bakery. This is a silent, confusing failure.

**Impact analysis:**
- `BrowsingLocationContext.tsx`: Clear override on user change
- Risk 1: Legitimate returning users lose their GPS override on app restart if we over-aggressively clear. The fix should only clear on user ID change, not on every mount.
- Risk 2: None — the fallback chain correctly resolves to address/society after override is cleared.

**Fix:** Add a `useEffect` that watches `user?.id` and clears the override if the stored location was set by a different user. Store `user_id` alongside the location in localStorage.

---

## Bug 5: Checkout delivery distance validation is missing — buyer can order from an out-of-range seller

**Where:** `useCartPage.ts` lines 298-323 (pre-checkout validation)

**What happens:** The pre-checkout validation checks: product availability (line 308-312), store closed status (lines 314-322), minimum order (lines 298-301), and payment method (lines 325-333). But it does NOT validate whether the buyer's delivery address is within the seller's `delivery_radius_km`. 

The `search_sellers_by_location` RPC uses `LEAST(_radius_km, COALESCE(sp.delivery_radius_km, _radius_km))` to filter sellers during discovery. But this uses the *browsing location*, not the *delivery address*. A buyer may browse near their office (location override) but order for delivery to their home (selected delivery address). If home is outside the seller's delivery radius, the RPC discovery was valid but the delivery is not.

The `create_multi_vendor_orders` RPC may have server-side range validation (it returns `delivery_out_of_range` error), but the client doesn't pre-validate this, so the buyer fills out the entire checkout form only to get rejected at the final step.

**Why critical:** A buyer selects "Delivery", picks their home address 6km away, fills in notes, selects payment method, and taps "Place Order" — only to get "Delivery address is out of range." This is a frustrating, late-stage rejection that could have been caught immediately when they selected the address.

**Impact analysis:**
- `useCartPage.ts`: Add delivery distance check in the pre-validation section (lines 298-323)
- Risk 1: Requires knowing each seller's latitude/longitude and `delivery_radius_km`. The cart items have `product.seller` with full seller profile data (fetched in `useCart.tsx` line 84: `seller:seller_profiles(*)`), which includes these fields.
- Risk 2: Haversine calculation on client is an approximation — could differ slightly from server. Use a small buffer (e.g., +0.5km) to avoid false rejections.

**Fix:** After the closed-sellers check, iterate `sellerGroups` and compare haversine distance between `selectedDeliveryAddress` and seller lat/lng against `seller.delivery_radius_km`. Show a specific error per seller if out of range.

---

## Summary

| # | Bug | Severity | Location |
|---|-----|----------|---------|
| 1 | `operating_days` missing from RPC — closed-day stores appear open | **CRITICAL** | `search_sellers_by_location` RPC |
| 2 | Hardcoded `'Seller'` fallback violates no-dummy-data policy | **MEDIUM** | 4 discovery hooks |
| 3 | `is_available: true` hardcoded — unavailable products appear live | **HIGH** | 4 discovery hooks + RPC |
| 4 | Stale GPS location persists across user sessions on shared devices | **HIGH** | `BrowsingLocationContext.tsx` |
| 5 | No client-side delivery distance pre-validation at checkout | **HIGH** | `useCartPage.ts` |

## Files to Edit

- **DB Migration** (Bugs 1 + 3): Update `search_sellers_by_location` to return `operating_days` and include `is_available` in product JSON
- `src/hooks/queries/useNearbyProducts.ts` (Bugs 2 + 3)
- `src/hooks/queries/useTrendingProducts.ts` (Bugs 2 + 3)
- `src/hooks/queries/usePopularProducts.ts` (Bugs 2 + 3)
- `src/hooks/queries/useProductsByCategory.ts` (Bugs 2 + 3)
- `src/contexts/BrowsingLocationContext.tsx` (Bug 4)
- `src/hooks/useCartPage.ts` (Bug 5)

