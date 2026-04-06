## Analysis

The post-live product form (Dialog popup in SellerProductsPage) actually contains **all** the same fields as onboarding: image, name, price, MRP, category, veg toggle, bestseller, recommended, urgent, stock management, attributes, service fields, lead time, and pre-orders.

The gap is **presentation, not functionality**:
- **Onboarding**: Inline, step-by-step, full-page — feels structured
- **Post-live**: Everything crammed into a scrollable Dialog popup — feels overwhelming

## Plan: Full-page product editor route

### Step 1: Create `/seller/products/new` and `/seller/products/:id/edit` routes
- Navigate to a dedicated full-page form instead of opening a dialog
- Reuse the same `useSellerProducts` hook for form state/save logic

### Step 2: Build `SellerProductFormPage.tsx` — Multi-step structured layout
Break the form into clear steps/sections with visual separation:

1. **Basics** — Image, name, description, category, subcategory
2. **Pricing** — Price, MRP, discount preview
3. **Configuration** — Action type, veg toggle, prep time, lead time, pre-orders, contact phone
4. **Visibility & Stock** — Bestseller, recommended, urgent alert, stock tracking, availability
5. **Attributes** — Attribute block builder
6. **Service Config** — Service fields + availability (only if service category)
7. **Preview** — Live preview panel (existing `ProductFormPreview`)

Each section is a collapsible card — all visible on one scrollable page, no tabs/wizard, but clearly segmented with headers and icons.

### Step 3: Update SellerProductsPage
- Replace Dialog-based form with navigation to the new route
- "Add Product" button → `navigate('/seller/products/new')`
- "Edit" button → `navigate(`/seller/products/${product.id}/edit`)`

### Step 4: Preserve existing data
- Edit mode loads product data from the existing `useSellerProducts.openEditDialog` flow
- No data is overwritten — same save logic as current Dialog form
- Draft auto-save via localStorage persists across navigation

### What stays the same
- `useSellerProducts` hook (unchanged — all form logic stays)
- `ProductFormPreview` component (reused)
- `AttributeBlockBuilder`, `ServiceFieldsSection` (reused)
- Save/validation logic (unchanged)
- Bulk upload (stays as dialog — it's appropriate there)

### Files to create/modify
- **New**: `src/pages/SellerProductFormPage.tsx` — Full-page structured form
- **Modify**: `src/pages/SellerProductsPage.tsx` — Remove Dialog, use navigation
- **Modify**: `src/App.tsx` — Add new routes
