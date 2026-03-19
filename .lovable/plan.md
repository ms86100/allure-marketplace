

## Analysis of Reference UI (Blinkit/Zomato)

The reference shows a polished grocery-style marketplace with these key patterns:
1. **Icon-label tab bar** at top (All, Summer, Ramzan, Electronics, Beauty) with active indicator line underneath
2. **Category grids** organized by parent group (e.g., "Grocery & Kitchen", "Snacks & Drinks") — 4-column grid of rounded tiles, each with a product image and a category label below
3. **Themed banner sections** (Ugadi, Navratri Specials) with rich imagery
4. **"Frequently bought" section** showing grouped past purchases as teal cards with collage images and "+N more" badges
5. **"Featured this week"** horizontal scroll of curated cards

### Key differences from our current UI:

| Aspect | Reference (Blinkit) | Our Current UI |
|--------|---------------------|----------------|
| Category tiles | 4-col grid, image on dark rounded card, label BELOW the image | 2-col grid, image with text overlay inside card |
| Tab bar | Icon + label, horizontal scroll, underline active indicator | Pill-shaped buttons (already close) |
| Category card style | Dark bg, rounded-xl tiles, product image centered, label underneath as separate text | Card with gradient overlay, text on image |
| Section headers | Bold white text, left-aligned, no "See all" initially | Has "See all" link — fine |
| Frequently bought | Teal/green bg cards, 2 product thumbnails + "+N more" badge | We have BuyAgainRow — different pattern |
| Featured this week | Horizontal scroll of themed cards | We have FeaturedBanners — similar |

---

## Implementation Plan

### Step 1: Redesign CategoryImageGrid to match Blinkit-style 4-column tiles

**Current**: 2-col responsive grid with image overlay text and metadata row below.
**Target**: 4-column grid with:
- Dark/subtle rounded-xl container per tile (~80px square on mobile)
- Product image(s) centered inside the tile
- Category name as text BELOW the tile (not overlaid)
- No metadata row (seller count, min price) — keep it clean
- Remove gradient overlay

Changes in `src/components/home/CategoryImageGrid.tsx`:
- Switch grid from `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` to `grid-cols-4` always
- Remove the gradient overlay div, count badge, bestseller star, and accent bar
- Move category `displayName` below the image container as a separate centered text element
- Remove the metadata row (sellers/price)
- Make image area square-ish (`aspect-square`) with `bg-secondary` rounded container
- Show single representative image (first collage image or category image) centered, not as a collage

### Step 2: Enhance ParentGroupTabs with active underline indicator

**Current**: Pill-shaped buttons with bg color change.
**Target**: Keep current pill style (it's already clean and works well). Minor polish:
- Ensure icon + label alignment matches reference
- This is already close to the reference — minimal changes needed

### Step 3: Redesign BuyAgainRow as "Frequently bought" grouped cards

**File**: `src/components/home/BuyAgainRow.tsx`
- Check current implementation and adapt to show category-grouped purchase history
- Display as teal/green rounded cards with 2 product thumbnails + "+N more" badge
- Category name below each card
- 3-column scrollable layout

### Step 4: Update MarketplaceSection layout order

Reorder sections in `src/components/home/MarketplaceSection.tsx` to:
1. Featured Banners / Auto-Highlights (keep)
2. ParentGroupTabs (keep)
3. Category Image Grids — with new 4-col tile design
4. Discovery rows (Popular, New This Week) — keep
5. Product listings by category — keep horizontal scroll
6. Store discovery — keep

### Step 5: Typography and spacing refinements

- Section headers: increase to `font-extrabold text-base` (already defined in `.section-header`)
- Add more vertical spacing between category grid sections (`mb-8` instead of `mb-6`)
- Category tile labels: `text-xs font-semibold text-foreground text-center` with `mt-2`

---

## Technical Details

**Files to modify:**
1. `src/components/home/CategoryImageGrid.tsx` — Major redesign of tile layout (4-col, image-above-label pattern)
2. `src/components/home/MarketplaceSection.tsx` — Minor reordering, spacing adjustments
3. `src/components/home/BuyAgainRow.tsx` — Inspect and potentially redesign to match "Frequently bought" pattern
4. `src/index.css` — Add any needed utility classes for the new tile style

**Constraints honored:**
- All data-driven from `category_configs`, `products`, `parent_groups`
- No hardcoded/dummy data
- No breaking changes to existing functionality
- Images sourced from actual product `image_url` or `category_configs.imageUrl`

