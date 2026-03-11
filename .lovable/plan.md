

# Add Live Preview to Seller Onboarding Product Form

## Problem
The live preview was added to `SellerProductsPage.tsx` (the existing products management page) but **not** to `DraftProductManager.tsx`, which is the product form used during seller onboarding (`/become-seller`, step 5). The user is currently on the onboarding flow and does not see the preview.

## Solution
Integrate the same `ProductFormPreviewPanel` and `ProductFormPreviewMobile` components into `DraftProductManager.tsx` by:

1. **Map `DraftProduct` state to `ProductFormData`** — the preview components expect `ProductFormData` shape. A simple `useMemo` adapter will bridge `newProduct` (DraftProduct) to the expected format.

2. **Update form layout** — when the "Add Product" form is open (`isAdding === true`), switch to a two-column layout on desktop (form left, sticky preview right), matching the existing pattern in `SellerProductsPage`.

3. **Add mobile floating preview** — render `ProductFormPreviewMobile` below the form card, same as the existing products page.

## Files Changed
- **Edit**: `src/components/seller/DraftProductManager.tsx`
  - Import `ProductFormPreviewPanel`, `ProductFormPreviewMobile` from `ProductFormPreview`
  - Add a `useMemo` to convert `newProduct` → `ProductFormData`
  - Wrap the add-product form card in a `flex gap-6` container with the preview panel on the right
  - Render `ProductFormPreviewMobile` for mobile users

No new files or database changes needed — reuses existing preview infrastructure.

