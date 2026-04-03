

# Bulk Add Product — Gap Analysis & Upgrade Plan

## Current State

**Add Product** supports 20+ fields including subcategory, action type, MRP, stock management, attribute blocks, service fields, lead time, pre-orders, and image upload.

**Bulk Add** supports only 6 fields: name, price, category, description, is_veg, prep_time_minutes. It produces incomplete product records missing defaults that Add Product provides (action_type defaults to nothing, stock defaults missing, no subcategory).

## Gap Analysis

| Field | Add Product | Bulk Add | Impact |
|-------|------------|----------|--------|
| Subcategory | ✅ | ❌ | Products lack proper classification |
| Action Type | ✅ (add_to_cart, contact_seller, etc.) | ❌ (no default set) | DB gets null action_type |
| MRP (original price) | ✅ | ❌ | No discount display possible |
| Stock Quantity | ✅ | ❌ | No inventory tracking |
| Low Stock Threshold | ✅ | ❌ | No low-stock alerts |
| Image | ✅ (required) | ❌ | Products stuck as drafts |
| is_bestseller / is_recommended | ✅ | ❌ | Minor — defaults to false OK |
| Lead Time / Pre-orders | ✅ | ❌ | Missing for applicable categories |
| Attribute Blocks | ✅ (auto-populated from library) | ❌ | No "Extra Details" |
| Service Fields | ✅ | ❌ | Services created without booking config |

## Design Principle

Bulk Add should be **fast for essential fields, with smart defaults for everything else**. The seller completes details later by editing individual products. This is already the pattern (products save as drafts, images added later).

## Plan

### 1. Add Subcategory Column (Grid + CSV)

When a category has subcategories, show a subcategory dropdown per row. CSV gets a `subcategory` column. The select query fetches subcategories for all allowed categories upfront.

### 2. Add Action Type Column

Add a per-row action type select with options driven by category config. Default to `add_to_cart`. When `contact_seller` is selected, price becomes optional (matching Add Product behavior). CSV supports `action_type` column.

### 3. Add MRP Column (Optional)

Add an optional MRP field beside price. If MRP > price, discount is auto-calculated on the product card. CSV supports `mrp` column.

### 4. Add Stock Quantity Column (Optional)

Single column for initial stock. `low_stock_threshold` defaults to 5 (matching Add Product). CSV supports `stock_quantity` column.

### 5. Smart Defaults on Insert

When saving bulk rows, apply the same defaults Add Product uses:
- `action_type`: default `'add_to_cart'`
- `low_stock_threshold`: default `5`
- `is_bestseller/is_recommended/is_urgent`: default `false`
- `accepts_preorders`: default `false`
- `contact_phone`: pull from user profile if action_type is contact_seller
- `specifications`: auto-populate from block library defaults for the category (same as Add Product edit flow)

### 6. CSV Template Update

Update the generated CSV template to include all new columns with clear examples:
```
name,price,mrp,category,subcategory,description,is_veg,prep_time_minutes,action_type,stock_quantity
```

### 7. Improve Grid UX

- Show/hide columns dynamically based on category config (already partially done for veg/duration)
- Add a horizontal scroll indicator for the wider table
- Add row-level category-aware hints (e.g., duration label from config)

### 8. Post-Save Guidance Enhancement

After bulk save, show a clear next-steps message: "Edit each product to add images, extra details, and service settings before submitting for approval."

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useBulkUpload.ts` | Add subcategory, action_type, mrp, stock_quantity to BulkRow; update CSV parsing, validation, and insert payload with smart defaults; auto-populate attribute blocks from library |
| `src/components/seller/BulkProductUpload.tsx` | Add new columns to grid (subcategory select, action_type select, MRP input, stock input); dynamic column visibility |
| No migration needed | All columns already exist in the products table |

## What Stays as "Edit Later"

These are intentionally excluded from Bulk Add (too complex for grid/CSV, better configured individually):
- **Image upload** — requires per-product file handling
- **Service fields** — complex multi-field config (duration, buffer, booking limits)
- **Attribute blocks** — auto-populated as defaults on insert, refined in edit
- **Lead time / pre-orders** — niche settings, edit later
- **is_bestseller / is_recommended** — promotional flags, set after approval

## Expected Result

Bulk Add creates products with the same data completeness as Add Product (minus image). Products are immediately ready for: image addition → submit for approval → go live. No field gaps between the two flows.

