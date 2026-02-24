

# Attribute Block Schema Standardization, Category Enforcement, and Input Type Clarity

## Problems Found

### 1. Two Incompatible Schema Formats
The original 12 blocks use a JSON Schema format (`{properties: {key: {type: "string"}}}`), while the newer ~60 blocks use a structured fields format (`{fields: [{key, label, type, options?}]}`). The `AttributeBlockForm` component only understands the `properties` format, so **all ~60 newer blocks render as empty forms with no input fields**.

### 2. No Category Enforcement
Currently, `AttributeBlockBuilder` shows ALL blocks to every seller regardless of category. Blocks matching the seller's category are merely sorted to the top ("Suggested" badge) but every other block is still available. This allows a Home Food seller to add "BHK Configuration" or a Plumber to add "Book Details" -- completely irrelevant attributes.

### 3. "Custom Details" Block Allows Arbitrary Data
The `custom_attributes` block has empty `category_hints` (`[]`), letting any seller add unlimited free-form key-value pairs, defeating the purpose of structured attributes.

### 4. Buyer Renderer Hardcoded
`ProductAttributeBlocks` uses hardcoded checks for specific block types (`variants`, `size_chart`, `custom_attributes`) and specific field names (`methods`, `certifications`, `policy`). It cannot render the ~60 newer blocks meaningfully since their data keys don't match any hardcoded path.

---

## Solution

### A. Standardize All Schemas to the `fields` Format

Migrate the original 12 block schemas from `{properties: ...}` to `{fields: [...]}`. Every field will have:

| Property | Required | Description |
|----------|----------|-------------|
| `key` | Yes | Data storage key |
| `label` | Yes | Human-readable label shown in the form |
| `type` | Yes | One of: `text`, `number`, `select`, `tag_input`, `boolean`, `textarea`, `date` |
| `options` | For `select` | Array of allowed values |
| `placeholder` | No | Input placeholder text |

Example -- `service_duration` block (before):
```text
{ "properties": { "duration_minutes": { "type": "number" }, "unit": { "type": "string" } } }
```

After:
```text
{
  "fields": [
    { "key": "duration_minutes", "label": "Duration (minutes)", "type": "number", "placeholder": "e.g. 60" },
    { "key": "unit", "label": "Unit", "type": "select", "options": ["Minutes", "Hours", "Days"] }
  ]
}
```

All 12 original blocks will be updated via a data UPDATE query.

### B. Rewrite `AttributeBlockForm` to Render from `fields` Array

The form renderer will iterate over `schema.fields` and render each field based on its `type`:

| Field Type | UI Component | Example |
|-----------|-------------|---------|
| `text` | `Input` (single line) | Brand name, Title |
| `textarea` | `Textarea` (multi-line) | Description, Policy details |
| `number` | `Input type="number"` | Duration, Price, Quantity |
| `select` | `Select` dropdown | Condition (New/Used), Mode (Online/Offline) |
| `tag_input` | Chip/tag input (add/remove) | Cuisine tags, Dance styles |
| `boolean` | `Switch` toggle | Materials included (yes/no) |
| `date` | `Input type="date"` | Expiry date, Availability date |

This replaces the current generic JSON Schema interpreter with an explicit, predictable system.

### C. Enforce Category-Based Block Filtering

In `AttributeBlockBuilder`, change the filtering logic:
- **With a category selected**: Only show blocks where `category_hints` includes the seller's current category. Blocks with empty `category_hints` are hidden (no universal free-for-all blocks).
- **Without a category**: Show no attribute blocks (the seller must select a category first).

This completely prevents irrelevant blocks from appearing.

### D. Remove the "Custom Details" Block

Delete the `custom_attributes` block from the library. Sellers cannot add arbitrary key-value pairs. If a specific attribute is needed, it should be added as a proper block by the platform (via admin or migration).

### E. Rewrite `ProductAttributeBlocks` for Generic Field-Based Rendering

Instead of hardcoding for specific block types, the buyer renderer will:
1. Look up each block's `type` in the block library (fetched once, cached)
2. Use the `renderer_type` to decide layout (key_value, tags, table, badge_list, text)
3. Use the `fields` schema to get proper labels for data keys
4. Handle tag arrays as Badge rows, select values as text, etc.

For blocks with `tag_input` fields, render as `Badge` chips. For `key_value` blocks, render label-value pairs using the field labels from the schema (not raw keys like `duration_minutes`).

---

## Files to Change

| File | Action | What Changes |
|------|------|---------|
| `src/components/seller/AttributeBlockForm.tsx` | Rewrite | Render from `schema.fields` array with select, tag_input, date, textarea support |
| `src/components/seller/AttributeBlockBuilder.tsx` | Edit | Filter blocks strictly by category match; hide blocks when no category selected |
| `src/components/product/ProductAttributeBlocks.tsx` | Rewrite | Generic renderer using block library metadata + fields schema for labels |
| `src/hooks/useAttributeBlocks.ts` | Edit | Update `suggestedBlocksFirst` to `filterByCategory`; export block library for buyer renderer |
| DB data update (12 original blocks) | Data update | Convert `properties`-based schemas to `fields` format |
| DB data update (custom_attributes) | Data delete | Remove the `custom_attributes` block |

---

## Technical Details

### Updated Schema Examples for Original 12 Blocks

**Variants:**
```text
{
  "fields": [
    { "key": "options", "label": "Variant Options", "type": "variant_rows" }
  ]
}
```
(Special composite type -- renders as repeatable label + values rows. Handled as a special case in the form.)

**Size Chart:**
```text
{
  "fields": [
    { "key": "rows", "label": "Size Chart Rows", "type": "size_table" }
  ]
}
```
(Special composite type -- renders as a table editor.)

**Inventory:**
```text
{
  "fields": [
    { "key": "stock_count", "label": "Stock Count", "type": "number", "placeholder": "e.g. 50" },
    { "key": "low_stock_alert", "label": "Low Stock Alert At", "type": "number", "placeholder": "e.g. 5" },
    { "key": "unlimited", "label": "Unlimited Stock", "type": "boolean" }
  ]
}
```

**Availability Window:**
```text
{
  "fields": [
    { "key": "available_from", "label": "Available From", "type": "text", "placeholder": "e.g. 9:00 AM" },
    { "key": "available_until", "label": "Available Until", "type": "text", "placeholder": "e.g. 9:00 PM" },
    { "key": "seasonal_note", "label": "Seasonal Note", "type": "textarea" }
  ]
}
```

### Category Filtering Logic (Pseudocode)

```text
if (!category) return [];  // No blocks available without a category
return library.filter(b => b.category_hints.includes(category) && !activeTypes.has(b.block_type));
```

### Buyer Renderer Approach

The renderer will fetch the block library (cached 10 min) and for each block in `specifications.blocks`:
1. Find the matching library entry by `block_type`
2. Use `display_name` as the section header
3. Use `fields` from the schema to map data keys to human labels
4. Use `renderer_type` to choose layout (grid, tags, table, text)
5. Skip unknown block types silently (forward-compatible)

