

# Auto-Populate Category Attribute Blocks on Product Edit

## Problem
When editing a product, the "Extra Details" section shows empty because the product's `specifications` field is null. During onboarding, users manually add blocks via the drawer. The expectation is that category-relevant attribute blocks should appear automatically when editing, matching the creation experience.

Most products in DB have `specifications: null` — they were created without filling attribute blocks. When the edit dialog opens, it loads `null` → sets `attributeBlocks = []` → Extra Details shows empty.

## Fix

### 1. Auto-populate default blocks in `useSellerProducts.ts` → `openEditDialog`

After loading specifications on line 175-176, if no blocks exist, auto-populate from the attribute block library filtered by category:

```typescript
// Line 175-176 area
const specs = (product as any).specifications;
let blocks: BlockData[] = specs?.blocks && Array.isArray(specs.blocks) ? specs.blocks : [];

// If no saved blocks, auto-populate defaults for this category
if (blocks.length === 0 && product.category) {
  // Get library blocks for this category (from cached query)
  const defaultBlocks = filterByCategory(library, product.category);
  blocks = defaultBlocks.map(b => ({ type: b.block_type, data: {} }));
}
setAttributeBlocks(blocks);
```

This requires access to the block library data inside the hook. Two options:
- **Option A**: Import `useBlockLibrary` into `useSellerProducts` and use its cached data
- **Option B**: Pass library data as a parameter (less clean)

Going with Option A — add `useBlockLibrary()` call in `useSellerProducts.ts`.

### 2. Same auto-populate in `DraftProductManager.tsx` → `handleEditProduct`

Apply identical logic at line 326-331 so onboarding edit is consistent too.

### 3. Auto-expand the Extra Details collapsible when blocks exist

In `AttributeBlockBuilder.tsx`, add an effect to auto-open when blocks are pre-populated:

```typescript
useEffect(() => {
  if (value.length > 0 && !isOpen) setIsOpen(true);
}, [value.length]);
```

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useSellerProducts.ts` | Import `useBlockLibrary` + `filterByCategory`, auto-populate blocks in `openEditDialog` when specifications is empty |
| `src/components/seller/DraftProductManager.tsx` | Same auto-populate logic in `handleEditProduct` |
| `src/components/seller/AttributeBlockBuilder.tsx` | Auto-expand collapsible when blocks are pre-populated |

## No DB changes needed

