

# Blinkit-Style Home Page Redesign — Revised Plan

## Current State

The existing codebase already has:
- **`category_config`** DB table with parent groups, icons, colors, display order — no new tables needed
- **`parent_groups`** DB table with slug, name, icon, color, sort_order, layout_type
- **`featured_items`** table for banners (CMS-driven, supports templates)
- **`BuyAgainRow`** component fetching real order history via `get_user_frequent_products` RPC
- **`CategoryImageGrid`** — already redesigned to 4-col tiles
- **`ParentGroupTabs`** — horizontal scroll pills
- All labels driven by `useMarketplaceLabels` system

The core infrastructure is **already data-driven**. No new DB tables are needed. The work is purely UI refinement and section reordering.

---

## What Needs to Change

### 1. Header Cleanup (Header.tsx)
- The stats display says "orders today" but queries ALL completed/delivered orders (not today's). Fix the query to filter by today's date OR change the label to "orders served"
- Ensure the location pill doesn't overflow on small screens

### 2. BuyAgainRow — Insert Before Category Grids (MarketplaceSection.tsx)
- Currently `BuyAgainRow` is not rendered in `MarketplaceSection` at all — it needs to be imported and placed between the ParentGroupTabs and CategoryImageGrid sections
- Only shows for logged-in users with order history (already handled by the component returning null)

### 3. CategoryImageGrid — Visual Polish
- Add subtle card shadow (`shadow-sm`) to each tile for depth
- Use `bg-card` instead of `bg-secondary` for the tile container to match dark-mode aesthetics
- Increase tile border-radius to `rounded-2xl` (already done)
- Show 8 items per group (2 rows of 4) by default, currently showing 12

### 4. FeaturedBanners — Increase Banner Height
- Current height is `h-28` — increase to `h-36` for better visual impact matching the reference's taller banners
- This applies to all 5 banner templates

### 5. Section Order in MarketplaceSection
Reorder to match the reference flow:
1. Featured Banners / Auto-Highlights (keep)
2. ParentGroupTabs (keep)
3. **BuyAgainRow** (add here — "Frequently bought")
4. Category Image Grids per parent group
5. Discovery Rows (Popular, New This Week)
6. Product Listings by category
7. Store Discovery

### 6. ParentGroupTabs — Add Underline Indicator
- Replace the pill bg-change with an underline-style active indicator: remove `bg-primary` fill, add a 2px bottom border line for the active tab
- Keep icon + label layout

### 7. Search Bar — Pill Shape
- Change from `rounded-xl` to `rounded-full` to match the reference's pill-shaped search bar
- Increase padding slightly for a more prominent look

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/home/MarketplaceSection.tsx` | Import & render `BuyAgainRow`, reorder sections |
| `src/components/home/CategoryImageGrid.tsx` | Visual polish (shadow, bg-card, limit to 8 tiles) |
| `src/components/home/ParentGroupTabs.tsx` | Underline active indicator style |
| `src/components/home/FeaturedBanners.tsx` | Increase banner height from h-28 to h-36 |
| `src/components/layout/Header.tsx` | Fix stats label ("orders served" vs "orders today"), pill search bar shape |

## Constraints
- No new DB tables or migrations
- No dummy data — all components already query real data
- No breaking changes — all existing functionality preserved
- Fully data-driven from existing `category_configs`, `parent_groups`, `products`, `orders`

