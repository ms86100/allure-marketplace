

# Admin-Controlled Attribute Block Management

## Current State

The system already has all the foundational pieces:
- `attribute_block_library` table stores blocks with `block_type`, `display_name`, `schema` (fields array), `category_hints`, `renderer_type`, `is_active`
- `AttributeBlockBuilder` on the seller side strictly filters blocks by category -- sellers only see blocks matching their product category
- Sellers cannot create blocks; they can only select from the library and fill in values
- The `CategoryManager` in the admin panel manages categories with full CRUD

**What is missing**: There is no admin UI to create, edit, or delete attribute blocks. Currently, blocks are seeded via database migrations only. The admin needs a dedicated management interface.

## Plan

### 1. New Component: `AdminAttributeBlockManager`

A new admin component placed in the Settings tab (alongside `CategoryManager` and `SubcategoryManager`) that provides full CRUD for attribute blocks.

**Features:**
- **List view**: Shows all blocks grouped by category, with active/inactive toggle
- **Create block**: Form with fields for `display_name`, `block_type` (auto-generated from name), `icon`, `description`, `renderer_type`, and category assignment (multi-select from existing categories)
- **Edit block**: Modify any field including the schema (add/remove/reorder fields)
- **Schema builder**: A sub-form that lets the admin define each field in the block's schema:
  - Field key (auto-generated from label)
  - Field label
  - Field type (dropdown: text, number, select, tag_input, boolean, textarea, date)
  - Options (shown only when type is "select" -- comma-separated or tag input)
  - Placeholder text
- **Delete/deactivate**: Soft-delete via `is_active = false`
- **Category attachment**: Multi-select of categories from `category_config` to populate `category_hints`

### 2. Integration into Admin Panel

Add an "Attributes" tab to the admin `TabsList` in `AdminPage.tsx`, rendering `AdminAttributeBlockManager`.

### 3. No Database Changes Required

The `attribute_block_library` table already has all needed columns (`block_type`, `display_name`, `schema`, `category_hints`, `renderer_type`, `icon`, `description`, `display_order`, `is_active`). The admin UI will use standard Supabase CRUD operations on this existing table.

## Files to Change

| File | Action | What Changes |
|------|--------|-------------|
| `src/components/admin/AdminAttributeBlockManager.tsx` | Create | Full CRUD UI for attribute blocks with schema builder |
| `src/pages/AdminPage.tsx` | Edit | Add "Attributes" tab, import and render the new component |

## Technical Details

### Schema Builder Sub-Form

When creating or editing a block, the admin builds the `schema.fields` array visually:

```text
+------------------------------------------+
| Field 1                                  |
| Label: [Cuisine Type    ]                |
| Type:  [select ▼]                        |
| Options: [North Indian] [South Indian]   |
|          [Chinese] [Continental] [+ Add]  |
| Placeholder: [Select cuisine...]         |
| [Remove Field]                           |
+------------------------------------------+
| [+ Add Field]                            |
+------------------------------------------+
```

Each field generates a schema entry like:
```text
{ "key": "cuisine_type", "label": "Cuisine Type", "type": "select", "options": ["North Indian", "South Indian", "Chinese", "Continental"], "placeholder": "Select cuisine..." }
```

### Category Attachment

The admin selects one or more categories from `category_config` using a multi-select checkbox list. Selected category slugs are stored in `category_hints[]`. When a seller picks that category, the block appears in their "Customize Listing" section.

### Admin Tab Layout

The existing second TabsList row (7 columns) will become 8 columns, adding "Attributes" between "Features" and "Settings".

