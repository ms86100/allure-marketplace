

# Product Owner Evaluation: Sociva Marketplace — High-Impact Gaps & Recommendations

## Executive Summary

Sociva has a strong marketplace foundation: geo-aware discovery, multi-category support (products + services), cross-society browsing, coupon system, reviews, and a rich seller dashboard. Below are **small, high-impact improvements** that address real user psychology gaps — things buyers and sellers intuitively expect but currently cannot do or find.

---

## A. Buyer Experience Gaps

### 1. No Product-Level Favorites (Only Seller Favorites)

**Gap:** Favorites page (`FavoritesPage.tsx`) only saves *sellers*, not individual products. When a buyer sees a product they like but aren't ready to buy, there's no "Save for Later" or heart button on product cards/detail sheets.

**Psychology:** Every major marketplace trains users to heart/save items. Without it, users lose track of things they wanted and don't return.

**Fix:** Add a heart/bookmark icon to `ProductDetailSheet` and `ProductListingCard`. Store in a `product_favorites` table. Surface saved products in a tab on FavoritesPage alongside saved sellers.

**Effort:** Small — 1 new table, 2 UI touchpoints.

---

### 2. No Product Sharing

**Gap:** Search for "share product" returns zero results. Users cannot share a specific product with a neighbor via WhatsApp/link. Only the general "Invite neighbors" share exists.

**Psychology:** Word-of-mouth is the #1 growth driver in housing societies. A buyer who finds great homemade cake wants to tell their WhatsApp group. Currently impossible.

**Fix:** Add a share icon on `ProductDetailSheet` using `navigator.share()` with a deep link (`/product/{id}`). Include product name, price, seller name, and image in the share payload.

**Effort:** Very small — 1 button, no backend changes.

---

### 3. No "Orders" in Bottom Navigation

**Gap:** Bottom nav has: Home, Society, Browse, Cart, Account. Orders are buried inside Account. For a marketplace app, order tracking is a top-3 action.

**Psychology:** After placing an order, users compulsively check status. Swiggy/Zomato/Amazon all have orders prominently accessible. Currently requires 2+ taps.

**Fix:** Either replace "Society" (which is non-marketplace) with "Orders" icon, or add an "Orders" tab. Since the brief says "marketplace only", consider swapping Browse ↔ Orders since Browse duplicates the home page categories.

**Effort:** Very small — BottomNav config change.

---

### 4. Missing "Seller Response Time" Indicator

**Gap:** Seller detail page shows reviews and availability but not how fast the seller typically responds or accepts orders.

**Psychology:** In a community marketplace, trust = speed. If a buyer sees "Usually accepts in 5 min", they feel confident ordering. Without this, there's anxiety especially for new sellers.

**Fix:** Compute average time from `order placed → first status change` per seller. Show as a badge: "Responds in ~X min" on `SellerDetailPage` and `ProductDetailSheet`.

**Effort:** Small — 1 DB query, 2 UI badges.

---

### 5. No Visual Indication of "Open Now" vs "Opens at X" on Home Page

**Gap:** Store availability (`computeStoreStatus`) is used in `RecentlyViewedRow` to show "Closed" overlay, but the main `MarketplaceSection` product cards don't show whether the seller is currently open. A buyer browses, adds to cart, then discovers at checkout the store is closed.

**Psychology:** Wasted effort creates frustration. Users expect marketplace apps to surface availability upfront (like Swiggy's "Opens at 11 AM").

**Fix:** Add a small "Closed · Opens at X" or green dot for "Open" on `ProductListingCard` when displayed in discovery rows. The data is already available via `seller_profiles.availability_start/end`.

**Effort:** Small — UI-only, data already fetched.

---

### 6. Empty Cart Has No Cross-Sell

**Gap:** Empty cart state shows "Explore Marketplace" button. No suggestion of what to explore.

**Psychology:** This is a missed re-engagement moment. Users who emptied their cart or just completed an order see a dead-end.

**Fix:** Show "Popular in your society" or "Your frequently bought items" in the empty cart state. The `BuyAgainRow` component already exists — render a compact version here.

**Effort:** Very small — reuse existing component.

---

## B. Seller Experience Gaps

### 7. No "Preview My Store" for Sellers

**Gap:** Sellers manage products from `SellerDashboardPage` and `SellerProductsPage`, but there's no one-tap way to see their store as a buyer would see it.

**Psychology:** Sellers (especially home bakers, tutors) obsess over how their store looks. They want to check their cover image, product photos, and descriptions from the buyer's perspective.

**Fix:** Add a "Preview Store" button on the seller dashboard that links to `/seller/{sellerId}` (the public buyer-facing view).

**Effort:** Trivial — 1 button linking to existing page.

---

### 8. No Quick "Mark All as Out of Stock" / Vacation Mode

**Gap:** If a seller goes on vacation or runs out of ingredients, they must either toggle store availability (which hides everything) or edit each product individually.

**Psychology:** Home sellers often have unpredictable availability (festivals, travel). A quick "pause" that shows "Back on [date]" is more trust-building than disappearing.

**Fix:** Add a "Vacation Mode" toggle on seller settings with an optional return date. Show a banner on the store page: "On break · Back Dec 25". Different from just marking store unavailable because it sets buyer expectations.

**Effort:** Small — 1 column on `seller_profiles`, 1 UI toggle, 1 banner.

---

### 9. Seller Has No Visibility Into "Who Viewed My Products"

**Gap:** Sellers have analytics (orders, earnings) but no awareness of traffic/interest. A tutor who listed yoga classes doesn't know if 50 people viewed it but none booked, vs. nobody saw it.

**Psychology:** View counts create motivation. "42 people viewed your Chocolate Cake this week" encourages sellers to stay active, improve photos, or adjust pricing.

**Fix:** Use the existing `recently_viewed` localStorage data — but also log views server-side (a lightweight `product_views` table with product_id + timestamp). Show view counts on the seller dashboard product list.

**Effort:** Small — 1 table, 1 insert on product detail open, 1 count query on seller products page.

---

## C. Discovery & Navigation Gaps

### 10. No "Filter by Availability" on Category/Search Pages

**Gap:** `CategoryGroupPage` has sort options and search, but no filter for "Available Now" or "Delivery Available" or "Veg Only". Search page has `SearchFilters` but these may not cover availability.

**Psychology:** Users browsing "Homemade Food" at 7 PM want to see only what they can order *right now*. Scrolling past closed stores is friction.

**Fix:** Add toggle filters at top of category page: "Open Now", "Delivery", "Veg". Data is already present in the product/seller join.

**Effort:** Small — filter UI + client-side filtering on existing data.

---

### 11. No "Sort by Distance" in Category View

**Gap:** `SORT_OPTIONS` in `marketplace-constants.ts` likely includes price and relevance, but distance-based sorting is critical for a geo-aware marketplace.

**Psychology:** A buyer looking for a yoga class cares most about proximity. "Nearest first" is the most intuitive sort for services.

**Fix:** Add "Nearest" to sort options. Products already have `distance_km` from the marketplace query.

**Effort:** Trivial — 1 sort option, client-side sort.

---

### 12. Category Tiles Don't Show "New" Badge

**Gap:** Home page has a "New This Week" discovery row, but category tiles in `CategoryImageGrid` don't indicate which categories have new additions.

**Psychology:** A small "2 new" badge on a category tile creates curiosity and drives exploration. It answers "Has anything changed since I last checked?"

**Fix:** Compare product `created_at` against 7-day cutoff (already computed for `newThisWeek`). Show a small "N new" badge on category tiles that have recent additions.

**Effort:** Trivial — data already available in `metaMap`.

---

## D. Habit-Forming Micro-Features

### 13. No "Order Again" One-Tap from Home Page

**Gap:** `BuyAgainRow` exists but requires tapping each product individually. There's a `ReorderButton` on order detail, but no way to re-order a complete past order from the home page.

**Psychology:** The most habit-forming action is "repeat what I did last time." One tap to reorder last Tuesday's lunch is the Swiggy/Zomato behavior that drives daily usage.

**Fix:** In `WelcomeBackStrip`, add a "Reorder" button next to the last order info. Use existing `ReorderButton` component logic.

**Effort:** Small — compose existing components.

---

### 14. No Notification When Favorite Seller Adds New Product

**Gap:** Users can favorite sellers, but there's no trigger when a favorited seller adds a new product or runs a promotion.

**Psychology:** This is the pull-back mechanism. "Your favorite baker just added Mango Cheesecake" brings users back to the app without push marketing.

**Fix:** Add a DB trigger on `products` insert that checks `favorites` for that seller and creates `notification_queue` entries. Use existing notification infrastructure.

**Effort:** Small — 1 trigger, reuse notification pipeline.

---

## Priority Matrix

| # | Improvement | Impact | Effort | Priority |
|---|------------|--------|--------|----------|
| 2 | Product sharing | Very High | Very Low | P0 |
| 3 | Orders in bottom nav | High | Very Low | P0 |
| 5 | Open/Closed on product cards | High | Low | P0 |
| 7 | Seller "Preview My Store" | High | Trivial | P0 |
| 11 | Sort by distance | Medium | Trivial | P0 |
| 12 | "New" badge on category tiles | Medium | Trivial | P0 |
| 1 | Product-level favorites | High | Small | P1 |
| 6 | Cross-sell in empty cart | Medium | Very Low | P1 |
| 13 | One-tap reorder from home | High | Small | P1 |
| 10 | Filter by availability | High | Small | P1 |
| 4 | Seller response time | Medium | Small | P2 |
| 8 | Seller vacation mode | Medium | Small | P2 |
| 9 | Product view counts for sellers | Medium | Small | P2 |
| 14 | New product notifications | High | Small | P2 |

## Implementation Approach

All P0 items are UI-only or trivial config changes — zero database migrations, zero new tables, zero risk of breaking existing flows. They can be shipped in a single iteration.

P1 items need 1-2 small tables but reuse existing components and patterns.

P2 items involve backend triggers and new data flows but follow established patterns (notification queue, analytics queries).

