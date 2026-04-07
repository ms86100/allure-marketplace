

## Problem Analysis

Two issues to fix:

### Issue 1: Vague Validation Error Message
When saving, the toast says "Please fix 4 fields highlighted below" but since fields are spread across wizard steps, the user can't see which fields are highlighted. The validation needs to:
- Name which specific fields are missing (e.g., "Name, Image, Price, Category")
- Navigate the user to the step containing the first error

### Issue 2: Attributes Step is Broken/Empty
The `AttributeBlockBuilder` uses `filterByCategory()` which filters by `category_hints` on the `attribute_block_library` table. The table likely has no data or the `schema` column (which the form relies on for field definitions) doesn't exist — the actual DB column is `default_config`, not `schema`. The attribute blocks system needs to be properly wired to work per-category.

---

## Plan

### Step 1: Fix Validation to Show Field Names and Navigate to Correct Step

**File: `src/hooks/useSellerProducts.ts`**
- Change the error toast from generic "Please fix N fields highlighted below" to a specific message listing field names: e.g., "Missing: Product Name, Image, Price"
- Return or expose a `validationStepIndex` so the wizard can jump to the step containing the first error

**File: `src/pages/SellerProductFormPage.tsx`**
- On save failure, auto-navigate `currentStep` to the step that contains the first field error
- Map field keys to step indices: `name/image_url/category` → Step 0 (Basics), `price` → Step 1 (Pricing), `contact_phone` → Step 2 (Config)

### Step 2: Fix Attribute Block Library Data Pipeline

**Database migration:**
- Add a `schema` JSONB column to `attribute_block_library` if it doesn't exist (or alias `default_config` → `schema` in the query)
- Seed the `attribute_block_library` table with category-appropriate attribute blocks, each with proper `category_hints` and `schema.fields` definitions. Categories and their attributes:

| Category Group | Attribute Blocks |
|---|---|
| **Food** (home_food, bakery, snacks, beverages) | Dietary info (veg/vegan/gluten-free tags), Ingredients, Allergens, Shelf life, Serving size, Packaging type |
| **Clothing/Tailoring** (tailoring, clothing) | Size chart (size_table), Fabric/Material, Color variants (variant_rows), Care instructions |
| **Electronics** (electronics, appliance_repair) | Brand, Model, Warranty, Specifications (key-value), Condition |
| **Beauty/Salon** (beauty, salon, mehendi) | Duration, Ingredients, Skin type suitability |
| **Tutoring/Coaching** (tuition, coaching, tutoring) | Subject, Level/Grade, Mode (online/offline), Batch size |
| **Fitness/Yoga/Dance** (yoga, dance, fitness) | Session duration, Difficulty level, Equipment needed, Age group |
| **Rental** (equipment_rental, vehicle_rental, baby_gear) | Condition, Deposit required, Rental period, Availability calendar |
| **Home Services** (electrician, plumber, carpenter, ac_service, pest_control) | Service area, Tools provided, Warranty on work |
| **Groceries** | Weight/Volume, Brand, Organic/Non-organic, Expiry info |
| **Pet** (pet_food, pet_grooming, pet_sitting, dog_walking) | Pet type, Breed suitability, Duration |

Each block will have a `schema` JSON like:
```json
{
  "fields": [
    { "key": "fabric", "label": "Fabric", "type": "text" },
    { "key": "colors", "label": "Available Colors", "type": "tag_input" }
  ]
}
```

**File: `src/hooks/useAttributeBlocks.ts`**
- Update the query to map `default_config` to `schema` if the DB uses `default_config`, OR use the new `schema` column
- Ensure `category_hints` filtering works correctly with actual category slugs from `category_config`

### Step 3: Improve the Attributes Step UX

**File: `src/pages/SellerProductFormPage.tsx`**
- When the Attributes step has no available blocks for the selected category, show a helpful empty state: "No extra attributes available for this category" instead of a collapsed empty section
- Auto-expand the `AttributeBlockBuilder` on the Attributes step (it's the only content there)

**File: `src/components/seller/AttributeBlockBuilder.tsx`**
- Remove the `Collapsible` wrapper when used in the wizard step context (it's redundant since the step already provides the container)
- Auto-show available blocks inline instead of requiring the drawer tap, when there are few blocks (≤ 4)

### Technical Details

- Field-to-step mapping will be a simple object: `{ name: 0, image_url: 0, category: 0, price: 1, contact_phone: 2 }`
- The `handleSave` function will be updated to include human-readable labels in the toast
- Attribute block seeding SQL will insert ~15-20 blocks covering all major category groups
- The `schema` column will use JSONB type with a `fields` array matching the existing `FieldDef` interface

