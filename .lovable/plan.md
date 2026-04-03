

# Honest Gap Analysis: What's Still Not Robust

## What Was Already Implemented (Done)
- Product sharing (navigator.share) on ProductDetailSheet ✅
- Orders in BottomNav ✅
- "New" badge on CategoryImageGrid ✅
- Sort by distance in marketplace-constants ✅
- BuyAgainRow in empty cart state ✅
- Open/Closed status already shown on ProductListingCard via `computeStoreStatus` ✅

## What's Still Missing (Real Gaps)

### BUG 1: Shared Product Links Are Dead Links (CRITICAL)

The share button generates URLs like `/#/product/{product_id}`, but **there is no `/product/:id` route in App.tsx**. Every shared link lands on the 404 NotFound page.

This completely defeats the purpose of the share feature. A user shares a product to WhatsApp, their neighbor clicks it, and sees "Page not found."

**Fix:** Create a `/product/:id` route and a lightweight `ProductDeepLinkPage` that fetches the product by ID and opens the `ProductDetailSheet` (or redirects to the seller page with the product pre-selected).

**Effort:** Small — 1 new page, 1 route entry.

---

### GAP 2: No "Preview My Store" Button for Sellers

The seller dashboard (`SellerDashboardPage.tsx`) has QuickActions, StoreStatusCard, analytics — but zero way for a seller to see their public-facing store page. The `/seller/{sellerId}` buyer view exists, but there's no link to it from the dashboard.

**Fix:** Add a "Preview Store" button/link in the seller dashboard that navigates to `/seller/{activeSellerId}`.

**Effort:** Trivial — 1 button.

---

### GAP 3: Product-Level Favorites Still Missing

`FavoritesPage.tsx` only queries the `favorites` table which stores `seller_id`. There is no `product_favorites` table and no heart icon on product cards. Users can only favorite sellers, not individual products.

**Fix:**
1. Create `product_favorites` table (user_id, product_id, created_at) with RLS
2. Add heart icon to `ProductDetailSheet` and `ProductListingCard`
3. Add "Saved Products" tab on FavoritesPage

**Effort:** Small — 1 migration, 3 UI touchpoints.

---

### GAP 4: Seller Response Time Not Shown

The `trustSnapshot` in ProductDetailSheet shows `avg_response_min` when > 0, but this data is buried inside the "View product details" collapsible section. Most users won't see it. It's also not shown on the seller detail page header or on product cards in discovery.

**Fix:** Surface `avg_response_min` as a visible badge near the seller name (not hidden behind a toggle).

**Effort:** Trivial — move existing data to a more visible position.

---

### GAP 5: No Vacation Mode for Sellers

Sellers can toggle `is_available` (which hides their store entirely), but there's no "vacation mode" with a return date. Buyers just see the store disappear with no context.

**Fix:**
1. Add `vacation_until` column to `seller_profiles`
2. Add toggle in seller settings
3. Show "On break · Back [date]" banner on seller page instead of hiding the store

**Effort:** Small — 1 migration, 2 UI changes.

---

### GAP 6: No Product View Tracking for Sellers

Sellers see order stats but have zero visibility into product traffic. The `recently_viewed` data is localStorage-only (client-side, per-device). No server-side view tracking exists.

**Fix:**
1. Create `product_views` table (product_id, viewer_id, viewed_at)
2. Insert on ProductDetailSheet open
3. Show weekly view counts on SellerProductsPage

**Effort:** Small — 1 migration, 2 code changes.

---

### GAP 7: No "Filter by Availability" on Category Pages

`CategoryGroupPage` has sort options but no toggle filters for "Open Now", "Veg Only", or "Delivery Available." Users browsing categories at 7 PM see closed stores mixed with open ones.

**Fix:** Add chip-style toggle filters at the top of the category page, filtering client-side on already-fetched data.

**Effort:** Small — UI-only.

---

### GAP 8: No Notification When Favorited Seller Adds New Product

The `favorites` table exists, but there's no DB trigger that creates a `notification_queue` entry when a favorited seller inserts a new product. This is the key re-engagement mechanism that's completely absent.

**Fix:** Add a Postgres trigger on `products` INSERT that checks `favorites` for matching `seller_id` and inserts notification entries.

**Effort:** Small — 1 trigger, reuses existing notification pipeline.

---

## Priority (What to Fix First)

| # | Gap | Risk Level | Effort |
|---|-----|-----------|--------|
| 1 | Dead shared links (no /product route) | **CRITICAL** — feature is broken | Small |
| 2 | Seller "Preview Store" button | High — missing basic UX | Trivial |
| 3 | Product-level favorites | High — retention gap | Small |
| 4 | Response time badge visibility | Medium — data exists, poorly placed | Trivial |
| 5 | Vacation mode | Medium — seller trust gap | Small |
| 6 | Product view tracking | Medium — seller motivation | Small |
| 7 | Category filters | Medium — discovery friction | Small |
| 8 | Favorited seller notifications | Medium — re-engagement | Small |

**Gap #1 is a real bug** — the share button was added but the route it links to doesn't exist. This should be fixed immediately before any new features.

