

# Update Category Card Palette to Sociva Green System + Premium Styling

## What changes

### 1. New pastel palette (`src/lib/category-pastels.ts`)

Replace all current values with the Sociva Green-anchored system — softer, more cohesive, brand-aligned:

| Category | Current | New | Feel |
|----------|---------|-----|------|
| home_food | #C8E6C9 | #E8F5E9 | Fresh mint |
| bakery | #FFE0B2 | #F1F8E9 | Soft warm green |
| snacks | #FFF0B3 | #E0F2F1 | Light casual |
| groceries | #BBDEFB | #E3F2FD | Clean blue |
| beverages | #B2DFDB | #E8F5F2 | Cool refreshing |
| dairy | #FFF0B3 | #FFF8E1 | Cream |
| fruits | #C8E6C9 | #E8F5E9 | Fresh green |
| vegetables | #C8E6C9 | #F1F8E9 | Garden green |
| sweets | #FFE0B2 | #FFF3E0 | Warm amber |
| meat | #FFCDD2 | #FBE9E7 | Soft rose |
| seafood | #B2EBF2 | #E0F7FA | Ocean |
| pet_supplies | #E1BEE7 | #F3E5F5 | Lavender |
| stationery | #C5CAE9 | #E8EAF6 | Soft indigo |
| electronics | #BBDEFB | #E3F2FD | Tech blue |
| clothing | #F8BBD0 | #FCE4EC | Blush |
| beauty | #F8BBD0 | #FCE4EC | Blush |
| health | #B2DFDB | #E0F2F1 | Wellness teal |
| home_services | #C8E6C9 | #E8F5E9 | Green |
| cleaning | #B2EBF2 | #E0F7FA | Fresh blue |
| repairs | #FFF0B3 | #FFF8E1 | Warm |
| puja | #FFE0B2 | #FFF3E0 | Sacred amber |
| gifting | #F8BBD0 | #FCE4EC | Blush |
| pharmacy | #B2DFDB | #E0F2F1 | Health teal |
| laundry | #B2EBF2 | #E0F7FA | Clean blue |
| fitness | #C8E6C9 | #E8F5E9 | Active green |
| tutoring | #C5CAE9 | #E8EAF6 | Study indigo |
| salon | #F8BBD0 | #FCE4EC | Blush |
| catering | #FFE0B2 | #FFF3E0 | Warm amber |

Key difference: current colors are Material 200-level (too saturated for card backgrounds). New colors are 50-level — lighter, cleaner, more premium.

### 2. Premium card styling

Add subtle border + shadow to category card containers in both `CategoryImageGrid.tsx` and `MarketplaceSection.tsx`:

- Border: `border border-black/[0.04]` (near-invisible structure)
- Shadow: keep existing `shadow-sm`
- Already have `active:scale-[0.96]` tap feedback

### 3. Default pastel update

Change `DEFAULT_PASTEL` from `#E0E0E0` (gray) to `#F5F5F5` (near-white) for unmatched categories.

## Files changed

| File | Change |
|------|--------|
| `src/lib/category-pastels.ts` | Replace all hex values with lighter 50-level pastels |
| `src/components/home/CategoryImageGrid.tsx` | Add `border border-black/[0.04]` to card div |
| `src/components/home/MarketplaceSection.tsx` | Add `border border-black/[0.04]` to card button |

