

# UI Refinement — Glossy Polish, Data Enrichment & Dynamic Carousel

## Current Issues Identified

1. **No discount/MRP data**: Only 1 product (`Paneer masala`) has `mrp` set. All others have `mrp = null` and `discount_percentage = null`. The `ProductListingCard` already has discount badge logic (`hasDiscount`, `discountPct`) but no data to trigger it.

2. **No bestseller/recommended flags**: All 54 products have `is_bestseller = false` and `is_recommended = false`. Badge system exists but is inert.

3. **Featured banners have no `template`**: All 3 banners have `template = null`, so they render as plain `image_only`. The carousel has auto-rotate logic but the banners look flat — no text overlay, no gradient, no CTA buttons.

4. **Category tiles lack glossy feel**: Current tiles use `catColor + '25'` for background which is decent but the reference Blinkit tiles have a much richer look — darker card base with prominent colored borders and subtle inner glow.

5. **Missing product metadata**: No `brand`, `unit_type`, or `tags` on any products. These fields exist but are empty.

## Plan

### Step 1: Enrich Product Data (Database Migration)

Update existing products with meaningful MRP, discount, bestseller flags, and brand data:

- Set `mrp` on ~25 products (higher than `price`) to auto-calculate discounts
- Set `discount_percentage` where relevant (10-30% range)
- Mark 8-10 products as `is_bestseller = true` (spread across categories)
- Mark 5-6 as `is_recommended = true`
- Add `brand` to grocery/snack products (e.g., "Amul", "Tata", "Fresh Farm")
- Add `unit_type` where applicable (e.g., "500g", "1 kg", "per piece")

### Step 2: Upgrade Featured Banners (Database Migration)

Update the 3 existing `featured_items` to use rich templates:

| Banner | Template | Changes |
|--------|----------|---------|
| Fresh Groceries | `text_overlay` | Add subtitle, button_text "Shop Now" |
| Home Food Specials | `split_left` | Add subtitle, button_text "Order Now" |
| Beauty & Salon | `gradient_cta` | Add subtitle, button_text "Book Now" |

This makes the carousel visually dynamic with CTAs and text overlays instead of plain images.

### Step 3: Glossy Category Tiles (CategoryImageGrid.tsx)

Enhance the tile styling to match Blinkit's premium dark cards:

- Increase background opacity: `${catColor}30` (was `25`)
- Add subtle inner shadow/glow using the category color
- Add a thin colored top accent bar (2px) for visual identity
- Increase border opacity to `${catColor}40`
- Use `backdrop-blur-sm` on image overlay for glossy depth
- Improve the gradient overlay: stronger bottom-to-top gradient for text readability

### Step 4: Product Card Discount Display (ProductListingCard.tsx — already works)

The card already shows discount badges and MRP strikethrough. Once Step 1 seeds the data, these will automatically render. No code changes needed — just verify.

### Step 5: CSS Polish (index.css)

- Add a subtle warm tint to `--card` in dark mode: shift from pure `0 0% 12%` to `20 4% 12%` for a slightly warmer feel matching the reference
- Add CSS for the colored top accent bar on category tiles
- Add a subtle `box-shadow` glow class using category colors

### Step 6: Featured Carousel Auto-Rotation Fix

The `FeaturedBanners.tsx` already has auto-rotate logic with `setInterval`. Review and ensure:
- Smooth transition between slides (CSS `scroll-behavior: smooth` is set)
- Dot indicators update correctly
- Touch pause/resume works

The auto-rotation code at line 58-64 looks correct. The issue may be that with only 3 banners and `image_only` template, it feels "static". Upgrading templates in Step 2 fixes this.

## Files to Modify

| File | Changes |
|------|---------|
| **Database** | Enrich ~25 products with MRP/discount/bestseller/brand/unit_type; upgrade 3 featured_items templates |
| `src/components/home/CategoryImageGrid.tsx` | Glossier tile styling — stronger color tint, accent bar, improved gradient overlay |
| `src/index.css` | Subtle warm card tint, category accent bar utility class |

## What This Achieves

- **Discount badges** appear on product cards automatically (data-driven)
- **Bestseller badges** appear on 8-10 products
- **Featured carousel** shows rich banners with text overlays and CTAs, auto-rotating
- **Category tiles** have a glossy, color-coded premium feel
- **Brand/unit labels** add information density to product cards
- All changes are data-driven — no hardcoding

