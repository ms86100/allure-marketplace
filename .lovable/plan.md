

# Round 2: Product Owner Evaluation — Remaining Gaps

## Status of Round 1 Items

| Item | Status | Notes |
|------|--------|-------|
| Product sharing | ✅ Done | Share button + deep link route working |
| Orders in bottom nav | ✅ Done | Replaces Browse |
| Open/Closed on cards | ✅ Already existed | via `computeStoreStatus` |
| Preview My Store | ✅ Done | On seller dashboard |
| Sort by distance | ✅ Done | Added to sort options |
| New badge on categories | ✅ Done | 7-day cutoff |
| Product-level favorites | ✅ Done | Table + button on detail sheet + favorites page tabs |
| Empty cart cross-sell | ✅ Done | BuyAgainRow in empty cart |
| One-tap reorder | ✅ Done | WelcomeBackStrip + SmartSuggestionBanner |
| Response time badge | ✅ Done | Surfaced prominently in ProductDetailSheet + SellerDetailPage |
| Product deep link route | ✅ Done | `/product/:productId` registered |
| Vacation mode buyer banner | ✅ Done | Shows on SellerDetailPage |
| Product view tracking (insert) | ✅ Done | Inserts on ProductDetailSheet open |
| Favorited seller notification trigger | ✅ Done | DB trigger exists |

---

## What's Still Missing (Round 2 Gaps)

### GAP 1: Vacation Mode Has No Seller Toggle (CRITICAL)

The buyer-facing banner exists on `SellerDetailPage.tsx` (lines 341-354) showing "On a break · Back on [date]". The `vacation_mode` and `vacation_until` columns exist in the DB.

But `SellerSettingsPage.tsx` has **zero references** to `vacation_mode` or `vacation_until`. Sellers have no way to enable vacation mode. The feature is half-built — display side done, control side missing.

**Fix:** Add a "Vacation Mode" toggle card in `SellerSettingsPage.tsx` with:
- Switch to enable/disable
- Optional date picker for `vacation_until`
- Save to `seller_profiles`

---

### GAP 2: Product View Counts Not Shown to Sellers

Server-side view tracking inserts into `product_views` table (ProductDetailSheet line 70). But `SellerProductsPage.tsx` has **zero references** to `product_views`. Sellers insert data but never see it.

**Fix:** Query `product_views` count (last 7 days) per product and show a small "👁 42 views" label on each product row in `SellerProductsPage`. Use a single aggregation query grouped by `product_id`.

---

### GAP 3: No Heart/Favorite on Product Discovery Cards

`ProductFavoriteButton` is used in `ProductDetailSheet` (on the image) and `FavoritesPage` (for removing). But `ProductListingCard.tsx` — the primary discovery card shown on home page, search, and category pages — has **no favorite button**. Users must open the product detail sheet to save a product.

**Psychology:** Long-press or heart-on-card is standard in every marketplace. Forcing users through a tap → sheet → heart flow creates friction that kills casual saving behavior.

**Fix:** Add `ProductFavoriteButton` to the top-right of `ProductListingCard` image area (where the discount badge goes on the left). Show only for logged-in users. Size `sm` with a semi-transparent background circle.

---

### GAP 4: No "Search Within Store" Persistence

On `SellerDetailPage.tsx`, the in-store search (`menuSearch`) works but resets on every page load. If a buyer leaves and returns, their search context is lost. More importantly, if the store has 20+ products, there's no category quick-jump.

The category pills exist (line 564-582) but only show when `categories.length > 2`. For stores with many products in the same category, scrolling is the only option.

**Fix:** Add a sticky category bar that auto-scrolls to the relevant section (anchor-based), similar to restaurant menus. This is client-side only using `scrollIntoView`.

---

### GAP 5: ProductListingCard Has No Seller Name for Cross-Society Browsing

When `browseBeyond` is enabled (searching nearby societies), `ProductListingCard` shows `locationLabel` (society name + distance) but the **seller name is buried** at the bottom in tiny text (line ~250). For cross-society browsing, the seller identity is critical because buyers don't recognize stores from other societies.

**Fix:** Make `seller_name` more prominent when `distance_km > 0` or `society_name` differs from the user's society. Move it above the product name or make it bolder.

---

### GAP 6: No Quick Way to Contact Seller from Order Detail

`OrderDetailPage.tsx` shows order info, status timeline, chat, and delivery tracking. But for "contact seller" action-type orders (tutoring, yoga, etc.), there's no direct phone/WhatsApp link on the order detail page after the order is placed. The buyer has to go back to the seller's profile to find contact info.

**Fix:** Show seller's phone number (already available in order data) as a tappable call/WhatsApp button on `OrderDetailPage` for `contact_seller` and service-type orders.

---

### GAP 7: Favorites Page Doesn't Show Store Open/Closed Status

`FavoritesPage.tsx` shows saved sellers and saved products. But saved sellers don't indicate whether they're currently open or closed. A user checks their favorites at dinner time to order — they have to tap into each store to see availability.

**Fix:** Use `computeStoreStatus` on each seller in the favorites list and show a green/red dot or "Closed · Opens 9 AM" label. Data is already available in the seller profile query.

---

### GAP 8: Search Page Missing "Nearest" Sort Option

`SearchPage.tsx` has sort options: "Top Rated", "Price ↑", "Price ↓" (line 107). But no "Nearest" option despite `distance_km` being available on search results. The category page now has "Nearest" sort (from Round 1), but the search page doesn't.

**Fix:** Add a "Nearest" sort chip to the search filter bar, sorting by `distance_km`.

---

### GAP 9: No "Similar Products" or "Others Also Bought" on Product Detail

`ProductDetailSheet` shows the product, seller info, trust signals, and a link to the seller's store. But no cross-sell recommendations. When a buyer views a product, there's no prompt to discover related items.

**Psychology:** "Customers who viewed this also bought" is one of the highest-converting elements in marketplace UIs. It increases session depth and average order value.

**Fix:** Below the seller link in `ProductDetailSheet`, query 4-6 products from the same category (excluding current product), prioritizing same seller → same society → nearby. Render as a horizontal scroll row using existing `ProductListingCard` in compact mode.

---

### GAP 10: No "Total Savings" Feedback After Checkout

When a buyer completes an order with discounted products (MRP vs price), there's no summary showing "You saved ₹150 on this order!" This positive reinforcement is standard in Swiggy/Amazon and creates dopamine-driven repeat behavior.

**Fix:** In `OrderProgressOverlay` or `OrderDetailPage`, calculate `sum(mrp - price)` for discounted items and show a small celebratory banner: "🎉 You saved ₹X on this order!"

---

## Priority Matrix

| # | Gap | Impact | Effort | Risk |
|---|-----|--------|--------|------|
| 1 | Vacation mode seller toggle | High — feature is half-built | Small | None |
| 3 | Heart on ProductListingCard | High — habit-forming | Trivial | None |
| 7 | Favorites open/closed status | Medium — reduces friction | Trivial | None |
| 8 | Search "Nearest" sort | Medium — consistency | Trivial | None |
| 2 | Seller product view counts | Medium — seller motivation | Small | None |
| 6 | Seller contact on order detail | Medium — service orders | Small | None |
| 10 | Total savings feedback | Medium — retention | Trivial | None |
| 5 | Seller name prominence | Low-Medium | Trivial | None |
| 9 | Similar products on detail | High — conversion | Small | None |
| 4 | Sticky category bar in store | Medium — large stores | Small | Low |

## Implementation Notes

- Gaps 3, 7, 8, 10 are purely UI changes — no migrations, no new tables
- Gap 1 needs only a UI toggle (DB columns already exist)
- Gap 2 needs only a SELECT query (table already exists, inserts already happening)
- Gap 9 needs a simple same-category query, no new infrastructure
- All changes use existing components and patterns — no new architectural concepts

