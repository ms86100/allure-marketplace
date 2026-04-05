

# Fix: Seed Missing Subcategories Data

## Problem
The `CategorySearchPicker` builds its search index from both `category_config` and `subcategories` tables. Your `subcategories` table is empty, so:
1. **Popular categories** show only category-level items (no subcategories like "Panchakarma")
2. **Search** can't find subcategory-specific terms (e.g., "panchakarma", "facial", "hatha yoga")
3. **Category selection** never opens the `SubcategoryPickerDialog` because `hasSubcategories` is always `false`
4. **Browse by category** shows only top-level categories, not the detailed subcategories within them

## Root Cause
The source project's subcategory data was entered via the admin UI, not through any migration or seed script. Neither the `reset-and-seed-scenario` edge function nor any SQL migration includes subcategory INSERT statements.

## Solution
Generate a comprehensive SQL seed script that inserts all subcategories referenced in the codebase (derived from `ALIAS_MAP`, `IDENTITY_MAP`, `POPULAR_SLUGS`, and the `SubcategoryPickerDialog` identity map). The script will:

1. **Look up `category_config` IDs dynamically** using `category` slugs (not hardcoded UUIDs)
2. **Insert ~80+ subcategories** across all parent categories: food (daily_tiffin, cakes, pickles, etc.), personal care (beauty, salon, mehendi, facial, bridal_makeup), classes & learning (yoga subtypes, dance, music, tuition), home services (electrician, plumber, maid, cook), professional help, rentals, buy & sell, events, pet services, property
3. **Include Ayurveda/Panchakarma subcategories** specifically: panchakarma_detox, abhyanga, shirodhara, nasya_therapy, basti_therapy, swedana, panchakarma_rejuvenation
4. **Set proper fields**: `slug`, `display_name`, `icon`, `display_order`, `is_active`, and behavioral flags (`show_veg_toggle`, `supports_addons`, `supports_recurring`, etc.)
5. **Use ON CONFLICT DO NOTHING** for idempotency

## Output
A downloadable SQL file at `/mnt/documents/seed_subcategories.sql` ready to paste into the Supabase SQL Editor.

## Technical Details
- Each subcategory links to its `category_config` via a subquery: `(SELECT id FROM category_config WHERE category = 'yoga')`
- Subcategories that appear in `POPULAR_SLUGS` (daily_tiffin, cakes, yoga, ayurveda, maid, electrician, beauty, tuition) get lower `display_order` values
- All subcategories are set `is_active = true`

