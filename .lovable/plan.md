

# Blinkit-Style Visual Refinement — Color-Visible Tiles + Data Seeding

## Problem

The `category_config` table already stores per-category colors (e.g., `#F97316` for Home Food, `#22C55E` for Groceries), but the UI barely uses them. Currently `CategoryImageGrid.tsx` applies `${catColor}12` — that's 7% opacity hex, nearly invisible on dark backgrounds. The reference Blinkit UI shows **bold, visible colored card backgrounds** per category tile.

Additionally: 0 featured items, only 5 categories have products, and no products exist outside `food_beverages`.

## Changes

### 1. Make Category Tile Colors Visible (CategoryImageGrid.tsx)

Current tile background: `${catColor}12` (invisible)

New tile design — dark card with **visible category color tint**:
- Background: `${catColor}25` (15% opacity) — visible but not overpowering
- Border: `1px solid ${catColor}30` (19% opacity) — subtle colored border
- When no image: radial gradient from `${catColor}35` center to `${catColor}15` edge
- Category label moves **inside** the card at the bottom with a dark gradient overlay
- This ensures the DB color value directly controls the visual identity of each tile

### 2. Multi-Image Collage per Tile (CategoryImageGrid.tsx)

Currently shows 1 representative image. Update `buildCategoryMeta` to collect up to 4 images per category. Render:
- 1 image: full cover
- 2 images: side by side
- 3-4 images: 2x2 grid

This matches the Blinkit reference where category tiles show multiple products.

### 3. Seed Products for More Categories (Database Migration)

Currently only 5 categories have products (all in `food_beverages`). Seed products with Unsplash images for:
- **personal_care**: beauty (3 products), salon (3), tailoring (2)
- **home_services**: electrician (2), plumber (2), ac_service (2)

Assign to existing sellers with expanded `categories` arrays. ~15 new products.

### 4. Seed Featured Items (Database Migration)

Insert 3 featured_items records using existing product IDs:
- "Fresh Groceries" banner → links to groceries category
- "Home Food Specials" → links to home_food category  
- "New Arrivals" → general

Each with an Unsplash banner image, `is_active = true`.

### 5. Update Category Config Colors to Match Blinkit Reference

The current colors are generic Tailwind defaults. Update specific ones to better match the Blinkit palette from the reference:

| Category | Current | Updated | Reason |
|----------|---------|---------|--------|
| groceries | `#22C55E` | `#2D8B4E` | Deeper green like Blinkit's "Fruits & Vegetables" |
| bakery | `#D946EF` | `#C2185B` | Warm pink/red like Blinkit's bakery cards |
| beverages | `#6366F1` | `#1565C0` | Richer blue like Blinkit's drinks section |
| home_food | `#F97316` | `#E65100` | Deeper orange for warmth |
| snacks | `#F59E0B` | `#F9A825` | Brighter golden yellow |

This is done via SQL UPDATE on `category_config.color` — the UI reads it dynamically, so the visual change is immediate with no frontend hardcoding.

### 6. Minor CSS Polish (index.css)

- `--card`: bump from `0 0% 11%` to `0 0% 12%` for slightly better tile visibility
- Add CSS variable `--card-elevated: 0 0% 15%` for hover/interactive states

## Files to Modify

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Visible color tint tiles, multi-image collage, label inside card |
| `src/index.css` | Minor `--card` tuning |
| **Database** | Update category_config colors, seed products for personal_care + home_services, seed 3 featured_items |

## What This Achieves

- Each category tile's visual color **directly matches** its `category_config.color` value
- No hardcoded colors in components — change the DB color, UI updates instantly
- Richer grid with multiple product images per tile
- More categories populated with real data
- Featured banners section becomes active

