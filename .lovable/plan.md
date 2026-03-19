

# Seed Data + Blinkit-Style Layout + Color Refinement

## Current State

- **9 total products** in the database, across only 4 categories (home_food, bakery, beverages, snacks)
- **8 out of 9 products have no images** — this is why the UI looks empty
- The seller with phone `7838459432` (closest match to `7838459422`) has seller_id `602762b5-03fc-4097-82a6-ec23b60ab67a`, business_name "7838", with only 1 product
- The reference Blinkit screenshots show **4-column grids** with a **single representative product image per category tile**, grouped under parent sections like "Grocery & Kitchen", "Snacks & Drinks", "Beauty & Personal Care"

## Plan

### Step 1: Seed Products via Database Migration

Insert **40-50 products** with real stock image URLs (from Unsplash/public CDNs) across the existing categories, distributed among the 3 existing sellers. Categories to populate:

**food_beverages group**: home_food, bakery, snacks, groceries, beverages
**personal_care group**: beauty, salon, laundry, tailoring
**home_services group**: electrician, plumber, carpenter, ac_service
**shopping group**: electronics, kitchen, clothing, furniture

Each product gets a publicly accessible image URL, realistic name, and reasonable price. The seller `602762b5` (phone 7838459432) gets products across multiple categories — also update their `categories` array and business_name to something meaningful.

### Step 2: Update Category Config Images

Set `image_url` on `category_config` rows for the most important categories so `CategoryImageGrid` can show representative images even when no products exist.

### Step 3: Refine the Layout — Blinkit 4-Column Tile Grid

The reference shows each parent group section as:
- **Bold section title** (e.g., "Grocery & Kitchen")
- **4-column grid** of category tiles
- Each tile: **single product image** filling a rounded square, **category name below**
- No 2x2 product mosaic — just one hero image per tile

**Changes to `CategoryImageGrid.tsx`**: Already uses a 4-column grid with single images — keep this pattern but ensure it picks the best product image.

**Changes to `MarketplaceSection.tsx`**: Remove the `ProductListings` 3-column grid (which shows 2x2 mosaics). The `CategoryImageGrid` sections already serve this purpose. After the category grids, show discovery rows only.

### Step 4: Color Palette — True Blinkit Dark

The reference uses a **near-pure black** background (`~#0D0D0D`), NOT warm brown. Current palette is too brown-tinted. Shift back:

| Variable | Current | New |
|----------|---------|-----|
| `--background` | `15 14% 5%` | `0 0% 5%` (neutral near-black) |
| `--card` | `18 12% 11%` | `0 0% 11%` (neutral dark grey) |
| `--secondary` | `18 10% 15%` | `0 0% 14%` |
| `--border` | `18 8% 18%` | `0 0% 16%` |
| Category tiles | warm gradient | `dark:bg-[hsl(0_0%_13%)]` with subtle border |

The warmth in Blinkit comes from **amber search bar** and **teal buy-again cards** — NOT from the base background. Keep search bar amber, keep BuyAgainRow teal, but make background neutral black.

### Step 5: Header Search Bar — Match Blinkit Exactly

Blinkit search: dark grey with subtle warm border, rounded-xl, large text. Update to:
- `dark:bg-[hsl(0_0%_12%)]` with `dark:border-[hsl(30_15%_22%/0.5)]` — subtle amber border on neutral dark bg

## Files to Modify

| File | Changes |
|------|---------|
| **Database migration** | Seed 40-50 products with images, update seller categories, set category_config image_urls |
| `src/index.css` | Shift dark palette from warm-brown back to neutral black |
| `src/components/layout/Header.tsx` | Neutral dark search bar with subtle amber border |
| `src/components/home/MarketplaceSection.tsx` | Remove `ProductListings` component — rely on `CategoryImageGrid` sections + discovery rows |

## Constraints
- All product data seeded via SQL migration with real public image URLs
- No hardcoding in frontend — all data-driven
- No breaking changes to existing cart, detail sheets, navigation
- Light mode unchanged

