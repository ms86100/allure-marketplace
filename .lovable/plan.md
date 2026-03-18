

# Home Screen UX Audit and Redesign Plan

## Gap Analysis

### 1. No Active Order Tracking on Home (CRITICAL)
The home screen has zero visibility into active/in-progress orders. If a buyer has an order being prepared or out for delivery, there is no banner, card, or indicator on the home page. Users must navigate to the Orders page to check status. Apps like Swiggy/Zomato always show an active order strip at the top. This is a significant trust and engagement gap.

**Existing data available:** `orders` table has status, seller info, timestamps. The system already tracks order lifecycle states via `category_status_flows`.

### 2. Unused Components Built but Not Wired (MEDIUM)
Three fully built home components are never rendered in `HomePage.tsx`:
- `SocietyLeaderboard` -- Top sellers and most ordered products (complete with medals, images, order counts)
- `TrendingInSociety` -- Trending products near the user
- `SocietyTrustStrip` -- Society verification badge, family count, seller count

These provide exactly the kind of social proof and trust signals the screenshots are lacking. The home screen feels empty partly because these exist but are disconnected.

### 3. Section Ordering Creates Poor First Impression (HIGH)
Current render order:
1. Profile completion banner
2. Notification banner
3. Arrival suggestion (conditional)
4. Smart suggestion (conditional)
5. Search suggestions (conditional)
6. Upcoming appointment (conditional)
7. Reorder last order (conditional)
8. Buy Again (conditional)
9. Society quick links (conditional)
10. **Marketplace section** (categories + products)
11. Community teaser

Problems:
- Items 3-8 are all conditional and often empty. A new user or user without order history sees nothing between the header and the marketplace section -- a large blank gap.
- The marketplace section (the core value) is buried below 6+ conditional empty slots.
- No visual hierarchy or section grouping. The page feels like a random stack of cards.

### 4. Category Image Grid Shows Empty Gray Cards (HIGH)
Screenshot 1 shows category cards with no product images -- just gray placeholder backgrounds with generic icons. This happens when `collageImages` is empty and no `imageUrl` fallback exists in the category config. The result looks broken and low-value, even though products exist in those categories (the "2 items" badge confirms this).

**Root cause:** Categories with products that have no `image_url` set show the icon fallback. This is data-correct but visually terrible.

### 5. Store Discovery Section Lacks Visual Polish (MEDIUM)
Screenshot 3 shows "In Your Society" and "Nearby Societies" sections where seller tiles show only a generic store icon (no logo). The seller name "7838" appears to be a phone number used as a business name -- this is a data quality issue that the UI should handle gracefully (e.g., truncate or show "Seller" as fallback for numeric-only names).

### 6. No Seller Activity Indicator (MEDIUM)
Seller tiles and product cards show no indication of whether the seller is currently online/available. The `last_active_at` field exists on seller profiles and is already passed through in `handleProductTap`, but is never displayed. A simple "Active now" or "Last seen 2h ago" would significantly increase buyer confidence.

### 7. "Popular near you" Section Title Lacks Context (LOW)
The section title shows the browsing location label but doesn't explain *why* items are popular (e.g., "12 orders this week"). The social proof data exists via `useSocialProof` but isn't surfaced in a human-readable way in the section header.

---

## Implementation Plan

| Step | What | Impact | Files |
|------|------|--------|-------|
| 1 | **Add ActiveOrderStrip to home** -- Query active orders (status not terminal), show a compact animated strip below the header with order status, seller name, and ETA. Tapping navigates to order detail. | Critical | New: `src/components/home/ActiveOrderStrip.tsx`, Edit: `HomePage.tsx` |
| 2 | **Wire unused components** -- Add `SocietyTrustStrip` after the location chip area, `SocietyLeaderboard` after the marketplace section, and `TrendingInSociety` between Buy Again and marketplace. | High | Edit: `HomePage.tsx` |
| 3 | **Reorder home sections** -- Move marketplace categories + products higher. Place conditional personalization sections (reorder, buy again, smart suggestions) below the core marketplace content rather than above it. Active order strip stays at the very top. | High | Edit: `HomePage.tsx` |
| 4 | **Handle empty category images gracefully** -- When a category has products but no images, show the category icon larger with a subtle colored background derived from the category config `color` field, instead of a flat gray box. | High | Edit: `CategoryImageGrid.tsx` |
| 5 | **Add seller activity indicator** -- Show "Active now" dot or "Last seen" text on seller tiles in `ShopByStoreDiscovery` using existing `last_active_at` data. Add a name sanitizer that replaces pure-numeric business names with "Local Seller". | Medium | Edit: `ShopByStoreDiscovery.tsx` |
| 6 | **Consolidate conditional sections** -- Wrap the conditional personalization blocks (SmartSuggestion, ArrivalSuggestion, Reorder, BuyAgain) in a single "For You" container so they don't create scattered empty gaps. Only render the container if at least one child has content. | Medium | New: `src/components/home/ForYouSection.tsx`, Edit: `HomePage.tsx` |

### Architecture Notes
- ActiveOrderStrip will query `orders` with a `.not('status', 'in', terminalFilter)` using `getTerminalStatuses()` from the existing status flow cache -- fully DB-driven, no hardcoded statuses
- All section titles, thresholds, and labels will use existing `useMarketplaceLabels()` where applicable
- No new tables, RPCs, or edge functions required -- all changes use existing queries and data

