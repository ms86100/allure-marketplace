

# Fix: Context-Aware Subcategory Picker Identity Label

## Problem
The `SubcategoryPickerDialog` component always renders the "You'll appear as: {identityLabel}" footer. This is correct during **onboarding** (where it sets the store identity), but **misleading during product creation** (where it merely classifies the product, not the store).

## Design Decision
- **Store identity** = fixed at onboarding, stored in `subcategory_preferences` — this is the seller's brand/label
- **Product subcategory** = per-product classification for discovery/filtering — does NOT change store identity
- Both are valid uses of subcategories, but the UI must distinguish them

## Changes

### File: `src/components/seller/SubcategoryPickerDialog.tsx`

Add a `context` prop (`'store' | 'product'`), defaulting to `'store'`:

- When `context='store'`: Show current "You'll appear as: Panchakarma Specialist" (no change)
- When `context='product'`: Replace with "This product will be listed under: Panchakarma" — informational, no identity implication

Also update the guidance text:
- Store context: "First pick becomes your **primary specialty**"
- Product context: "Choose the most relevant specialty for this product"

### File: `src/components/seller/DraftProductManager.tsx`

Pass `context="product"` to the `SubcategoryPickerDialog` rendered in standalone mode (~line 1200).

### No other files change
- `CategorySearchPicker` (onboarding) continues passing `context="store"` (default)
- No DB changes
- No logic changes to selection behavior

## Result
- Onboarding: "You'll appear as: Panchakarma Specialist" (unchanged)
- Add Product: "This product will be listed under: Panchakarma" (clear, no confusion)
- Store identity remains fixed and immutable from the product flow

