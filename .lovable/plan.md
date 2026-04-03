

# Show Product Description Across All Views

## Current State

- **Product form** (`SellerProductsPage.tsx` line 73): Description textarea has **no maxLength** and no character counter
- **Seller preview panel** (`ProductFormPreview.tsx` line 125-129): Shows description under "Highlights" — but with no truncation (can overflow)
- **Buyer detail sheet** (`ProductDetailSheet.tsx` line 188): Shows description under "Highlights" inside a collapsible "View product details" section — also no truncation
- **Product listing card** (`ProductListingCard.tsx`): Does **not** show description at all
- **Product card** (`ProductCard.tsx` line 120): Shows description with `line-clamp-2` — this is only used on the seller detail page

## Changes

### 1. Add character limit to product description input
**File**: `src/pages/SellerProductsPage.tsx` (line 73)

- Add `maxLength={300}` to the description Textarea
- Add character counter below: `{formData.description.length}/300`

### 2. Add description to ProductListingCard (buyer grid cards)
**File**: `src/components/product/ProductListingCard.tsx` (line 248, after the product name)

- Show `product.description` with `line-clamp-1` and `text-[10px] text-muted-foreground` — one line only, below the product name
- Only render when description exists and `!compact`

### 3. Truncate description in preview panel
**File**: `src/components/seller/ProductFormPreview.tsx` (line 128)

- Add `line-clamp-3` to the description paragraph so it doesn't overflow the preview drawer

### 4. Truncate description in buyer detail sheet
**File**: `src/components/product/ProductDetailSheet.tsx` (line 188)

- Wrap description in a component with "Read more" toggle: show 3 lines by default (`line-clamp-3`), tap to expand fully
- Simple local state toggle: `expanded` boolean, toggles between `line-clamp-3` and no clamp

### Summary

| Location | Current | After |
|----------|---------|-------|
| Product form | No limit | 300 chars max + counter |
| Seller preview (drawer) | No truncation | `line-clamp-3` |
| Buyer listing card | Not shown | 1-line truncated |
| Buyer detail sheet | No truncation | 3-line clamp + "Read more" |
| ProductCard (seller page) | `line-clamp-2` | No change needed |

