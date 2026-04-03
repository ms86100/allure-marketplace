

# Round 2 Gap Verification — Cross-Check Results

## Verified Status of All 10 Gaps

| Gap | Status | Evidence |
|-----|--------|----------|
| **1. Vacation Mode Seller Toggle** | ✅ **DONE** | `SellerSettingsPage.tsx` has full vacation mode card (lines 293-320) with Switch, date picker, saves `vacation_mode` + `vacation_until`. `useSellerSettings.ts` reads/writes both fields. |
| **2. Product View Counts for Sellers** | ✅ **DONE** | `SellerProductsPage.tsx` queries `product_views` table (line 38-42), aggregates last 7 days per product. |
| **3. Heart on ProductListingCard** | ✅ **DONE** | `ProductListingCard.tsx` imports and renders `ProductFavoriteButton` (line 184-187) in the image area for logged-in users. |
| **4. Sticky Category Bar in Store** | ❌ **NOT DONE** | Zero references to `scrollIntoView` or sticky category behavior in `SellerDetailPage.tsx`. Category pills exist but no anchor-based auto-scroll. |
| **5. Seller Name Prominence** | ✅ **DONE** | `ProductListingCard.tsx` line 252 conditionally applies `text-foreground font-medium` when `distance_km > 0`, making seller name bolder for cross-society browsing. |
| **6. Seller Contact on Order Detail** | ❌ **NOT DONE** | `OrderDetailPage.tsx` has zero references to WhatsApp, `wa.me`, or seller phone/contact buttons. No call/WhatsApp link for service orders. |
| **7. Favorites Open/Closed Status** | ✅ **DONE** | `FavoritesPage.tsx` imports `computeStoreStatus` (line 16) and uses it in `FavoriteSellerCard` (line 176). |
| **8. Search "Nearest" Sort** | ❌ **NOT DONE** | Zero references to "nearest" or "Nearest" in `SearchPage.tsx`, `useSearchPage.ts`, or `SearchFilters`. |
| **9. Similar Products on Detail** | ❌ **NOT DONE** | Zero cross-sell or "similar products" query in `ProductDetailSheet.tsx`. |
| **10. Total Savings Feedback** | ❌ **NOT DONE** | Zero references to "saved", "savings", or MRP-price calculation in `OrderDetailPage.tsx`. |

---

## Summary: 5 of 10 Gaps Still Open

### What needs to be built:

**GAP 4 — Sticky category bar in SellerDetailPage**
- Make category pills sticky with `position: sticky; top: X`
- Add `id` anchors to each category section heading
- On pill click, `scrollIntoView({ behavior: 'smooth' })` to the matching section
- Highlight active pill based on scroll position using IntersectionObserver

**GAP 6 — Seller contact button on OrderDetailPage**
- For orders with `action_type === 'contact_seller'` or service-type categories, show a "Call" and "WhatsApp" button
- Use seller phone from order data (already joined in the query)
- WhatsApp link: `https://wa.me/91{phone}?text=Hi, regarding order #{order_number}`
- Place below the seller info card

**GAP 8 — "Nearest" sort on SearchPage**
- Add `{ label: 'Nearest', value: 'nearest' }` to search sort options in `SearchFilters.tsx`
- In `useSearchPage.ts`, add sort case: `results.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999))`

**GAP 9 — Similar Products on ProductDetailSheet**
- Below seller link section, query 4-6 products from `products` table where `category = current.category AND id != current.id AND is_available = true`
- Render as horizontal scroll row with compact `ProductListingCard`
- On tap, close current sheet and open new one (or navigate)

**GAP 10 — Total Savings banner on OrderDetailPage**
- Calculate `totalSavings = sum(item.mrp - item.unit_price)` for items where `mrp > unit_price`
- If `totalSavings > 0`, show banner: "🎉 You saved ₹{totalSavings} on this order!"
- Place at top of order items section or below the order summary

### Files to modify:
1. `src/pages/SellerDetailPage.tsx` — sticky categories + scroll anchors
2. `src/pages/OrderDetailPage.tsx` — seller contact button + savings banner
3. `src/components/search/SearchFilters.tsx` — add Nearest sort option
4. `src/hooks/useSearchPage.ts` — add nearest sort logic
5. `src/components/product/ProductDetailSheet.tsx` — similar products row

### Risk Assessment
All 5 changes are additive UI features. No database migrations needed. No existing behavior modified. Zero regression risk.

