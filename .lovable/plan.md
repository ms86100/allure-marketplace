

# Replace Add Product Dialog with Full-Page Guided Flow

## Summary
The "Add Product" button currently opens a cramped `<Dialog>` modal. This plan replaces it with a full-page route that reuses `DraftProductManager` — the same component powering onboarding — giving instant feature parity (service fields, availability schedules, preview panel, draft recovery).

## Changes

### 1. Adapt `DraftProductManager.tsx` for standalone mode
Add new optional props:
- `mode?: 'onboarding' | 'standalone'` (default `'onboarding'`)
- `onComplete?: () => void` — called after save in standalone mode
- `initialProduct?: DraftProduct` — for edit mode (pre-loads product data from DB)
- `sellerProfile?: SellerProfile` — passed through for preview panel

**Standalone mode behavior:**
- `isAdding` defaults to `true` (auto-open form)
- Hide the product list section (lines 438-526: header, empty state, encouragement, product cards)
- Hide the "Add Product / Service" button at bottom
- On successful save → call `onComplete()` instead of appending to array
- Draft key: `draft-product-standalone-${sellerId}-${productId || 'new'}` (isolated per product)
- When `initialProduct` is provided → fully replace state on mount (no merge), load attribute blocks + service fields + availability from DB
- Pass `sellerProfile` to `ProductFormPreviewPanel` instead of `null`

**Unsaved changes protection:**
- Add `useEffect` with `window.onbeforeunload` when form is dirty in standalone mode
- On cancel/back navigation, show confirmation if dirty

### 2. Create `src/pages/SellerAddProductPage.tsx`
New full-page route that:
- Reads seller profile from `useAuth().currentSellerId` + fetches from DB (including `default_action_type`, categories)
- For edit mode: reads `productId` from URL param, loads product from DB, passes as `initialProduct`
- Renders a page header with "Back to Products" link + title ("Add Product" or "Edit Product")
- Renders `DraftProductManager` in `standalone` mode with:
  - `sellerId`, `categories`, `defaultActionType` from profile
  - `products={[]}` and `onProductsChange` as no-ops (not used in standalone)
  - `onComplete={() => navigate('/seller/products')}`
- Shows loading skeleton while fetching
- Shows error state if product not found (edit mode)

### 3. Add routes in `src/App.tsx`
Add two new lazy-loaded routes inside the seller section:
```
/seller/products/new       → SellerAddProductPage
/seller/products/edit/:id  → SellerAddProductPage
```

### 4. Strip dialog from `SellerProductsPage.tsx`
- **Remove**: The entire `<Dialog>` block (lines 62-152) — the product form modal
- **Remove imports**: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger`, `Textarea`, `ProductImageUpload`, `AttributeBlockBuilder`, `ProductFormPreviewPanel`, `ProductFormPreviewMobile`, `ServiceFieldsSection`, and other form-only imports
- **Replace** "Add Product" button → `<Link to="/seller/products/new">` (both in header and empty state)
- **Replace** Edit button on product cards → `<Link to={`/seller/products/edit/${product.id}`}>`
- **Remove** draft recovery banner (lines 169-183) — handled by the new page
- Keep: product list, bulk upload, delete dialog, seller switcher, approval actions, view counts

### 5. Slim down `useSellerProducts.ts`
Remove state and functions only used by the dialog form:
- `isDialogOpen`, `setIsDialogOpen`
- `editingProduct`, `setEditingProduct`
- `formData`, `setFormData`
- `fieldErrors`, `setFieldErrors`
- `attributeBlocks`, `setAttributeBlocks`
- `serviceFields`, `setServiceFields`
- `isSaving`
- `draftRestored`, `clearDraftFn`
- `resetForm`, `openEditDialog`, `handleSave`
- `activeCategoryConfig`, `showVegToggle`, `showDurationField`, `isCurrentCategoryService`
- All category supports* flags

Keep: `sellerProfile`, `products`, `isLoading`, `fetchData`, `deleteTarget`, `confirmDelete`, `toggleAvailability`, `licenseBlocked`, `isBulkOpen`, `allowedCategories`, `primaryGroup`, `configs`, `sellerProfiles`, `storeDefaultActionType`, `allActions`

## Edge Cases Addressed

1. **Draft key isolation**: `draft-product-standalone-${sellerId}-${productId || 'new'}` — no cross-tab/cross-product collision
2. **Unsaved changes**: `onbeforeunload` + confirmation on back navigation in standalone mode
3. **Edit mode isolation**: Full state replacement from DB load, never merged with stale draft
4. **Save behavior separation**: Standalone mode does single immediate save + `onComplete()`, no array manipulation

## Execution Order
1. Add `mode`/`onComplete`/`initialProduct` props to `DraftProductManager`
2. Create `SellerAddProductPage`
3. Add routes in `App.tsx`
4. Strip dialog from `SellerProductsPage` + replace with links
5. Clean up `useSellerProducts` hook

