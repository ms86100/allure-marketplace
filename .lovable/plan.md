

# Live Product Preview in Seller Product Editor

## Overview
Add a real-time preview panel inside the product creation/edit dialog that mirrors how the listing card will appear to buyers, updating instantly as the seller types or changes any field.

## Approach

### 1. New Component: `ProductFormPreview`
- File: `src/components/seller/ProductFormPreview.tsx`
- Takes the current `formData` (from `useSellerProducts`) and seller profile info
- Converts `ProductFormData` into a `ProductWithSeller` shape with mock/derived values
- Renders the existing `ProductListingCard` component in `viewOnly` mode
- Wraps it in a sticky panel with a "Preview" label and a phone-frame style container

### 2. Update Dialog Layout in `SellerProductsPage.tsx`
- Widen the dialog to `sm:max-w-4xl` (from `sm:max-w-2xl`)
- Split the `DialogContent` into a two-column grid layout:
  - **Left column**: Existing form fields (unchanged)
  - **Right column**: Sticky `ProductFormPreview` that scrolls with the form
- On mobile (narrow screens), the preview collapses into a toggleable floating button at the bottom that opens a small preview overlay

### 3. Data Mapping (`formData` → `ProductWithSeller`)
Inside `ProductFormPreview`, a `useMemo` maps form state to card props:
```
name        → product.name (or "Product Name" placeholder)
price       → parseFloat or 0
mrp         → parseFloat or null
image_url   → product.image_url
is_veg      → product.is_veg
is_bestseller → product.is_bestseller
category    → product.category
seller_name → sellerProfile.business_name
is_available → product.is_available
prep_time_minutes → parseFloat or null
accepts_preorders → product.accepts_preorders
lead_time_hours → parseFloat or null
stock_quantity → parseFloat or null
```

### 4. Mobile Experience
- Below `md` breakpoint: form stays full-width, a small floating "Preview" button appears at bottom-right
- Tapping it shows the preview card in a bottom sheet / overlay
- This avoids cramping the form on small screens

## Files Changed
- **New**: `src/components/seller/ProductFormPreview.tsx`
- **Edit**: `src/pages/SellerProductsPage.tsx` — widen dialog, add two-column layout with preview panel

No database changes required. The preview uses existing `ProductListingCard` with synthesized data from form state.

