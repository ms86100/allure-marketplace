

# Add Per-Category Icon Color Selection for Festival Banners

## Problem
All animated category icons in festival banners use the same `accentColor` (derived from the banner's gradient), making every category chip look identical in color. The admin has no way to differentiate categories visually.

## Solution
Add an `icon_color` column to `banner_sections` and a curated color picker in the admin UI. On the buyer side, use the per-section color instead of the global accent color.

## Curated Color Palette
Only colors that work well on the dark theme backgrounds:

| Name | Hex | Use case |
|------|-----|----------|
| Purple | `#A78BFA` | Default / culture |
| Amber | `#FBBF24` | Food / sweets |
| Emerald | `#34D399` | Nature / craft |
| Rose | `#FB7185` | Fashion / jewelry |
| Sky | `#38BDF8` | Music / art |
| Orange | `#FB923C` | Festive / fireworks |
| Teal | `#2DD4BF` | Home decor |
| Pink | `#F472B6` | Flowers / gifts |

## Changes

### 1. Database migration
- `ALTER TABLE banner_sections ADD COLUMN icon_color text DEFAULT NULL;`

### 2. Admin — color picker in `AdminBannerManager.tsx`
- Add a small row of 8 color swatches next to the existing `AnimatedIconPickerInline` for each section.
- Selected swatch gets a ring indicator. Store hex value in `icon_color`.
- Save/load `icon_color` alongside existing section fields.

### 3. Admin — `AnimatedIconPickerInline.tsx`
- No changes needed — color is a separate concern from icon selection.

### 4. Buyer — `FestivalBannerModule.tsx`
- In `SectionChip`, use `section.icon_color || accentColor` instead of just `accentColor` for the icon color and the chip's subtle background tint.

### 5. Type updates
- Add `icon_color?: string | null` to the `BannerSection` interface in `FestivalBannerModule.tsx` and the section type in `AdminBannerManager.tsx`.

## Scope
- 1 migration file (1 line ALTER)
- 3 files edited: `AdminBannerManager.tsx`, `FestivalBannerModule.tsx`, section type definitions
- No new dependencies

