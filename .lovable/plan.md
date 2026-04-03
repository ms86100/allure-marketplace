

# Revamp Food & Beverages Categories

## Current State
- 5 categories: Home Food, Bakery, Snacks, Groceries, Beverages
- All use `cart_purchase` workflow
- Zero subcategories exist
- `category` column uses a `service_category` enum — new values must be added to the enum

## Proposed Structure

| # | Category | Slug | Workflow | Why |
|---|----------|------|----------|-----|
| 1 | Home-Cooked Meals | `home_food` (existing) | `cart_purchase` | Daily food, add-to-cart + checkout |
| 2 | Snacks & Ready-to-Eat | `snacks` (existing) | `cart_purchase` | Quick bites, instant purchase |
| 3 | Homemade Sweets & Desserts | `sweets_desserts` (NEW) | `cart_purchase` | Replaces bakery (broader scope) |
| 4 | Beverages | `beverages` (existing) | `cart_purchase` | Juices, shakes, tea/coffee |
| 5 | Homemade / Organic Products | `homemade_products` (NEW) | `cart_purchase` | Pickles, masalas, packaged goods |
| 6 | Party & Bulk Orders | `party_bulk_orders` (NEW) | `request_service` | Needs custom quotes |
| 7 | Specialty / Niche Food | `specialty_food` (NEW) | `cart_purchase` | Jain, vegan, keto, baby food |
| 8 | Free / Community Sharing | `free_sharing` (NEW) | `contact_enquiry` | No payment — pure community |

## What Gets Removed/Deactivated
- **Groceries** → `is_active = false` (not deleted — enum value stays, no data loss)
- **Bakery** → `is_active = false` (merged into Sweets & Desserts)

## Subcategories Per Category

1. **Home-Cooked Meals**: Daily Tiffin, One-Time Meals, Breakfast, Healthy/Diet, Kids Meals, Regional Cuisine
2. **Snacks**: Evening Snacks, Namkeen/Mixtures, Fried Snacks, Baked Snacks, Instant Ready Mix
3. **Sweets & Desserts**: Traditional Sweets, Cakes, Chocolates, Eggless Desserts, Festival Specials
4. **Beverages**: Fresh Juices, Milkshakes & Smoothies, Tea/Coffee, Health Drinks, Summer Specials
5. **Homemade Products**: Pickles, Masalas & Spices, Papad/Fryums, Sauces & Chutneys, Organic Groceries
6. **Party & Bulk Orders**: Party Catering, Bulk Meals, Snack Platters, Birthday/Event Orders
7. **Specialty Food**: Jain Food, Vegan, Gluten-Free, Keto/Diet, Baby Food
8. **Free / Sharing**: Extra Food Giveaway, Community Sharing, Festival Food Sharing

## Implementation Steps

### Step 1: Database Migration
- Add 5 new enum values to `service_category`: `sweets_desserts`, `homemade_products`, `party_bulk_orders`, `specialty_food`, `free_sharing`

### Step 2: Data Updates (via insert tool)
- Deactivate `groceries` and `bakery` rows (`is_active = false`)
- Update `home_food` display_name to "Home-Cooked Meals", set `show_veg_toggle = true`
- Update `snacks` display_name to "Snacks & Ready-to-Eat"
- Insert 5 new `category_config` rows with correct icons, colors, behavior flags, and `transaction_type`
- Insert all subcategories (~40 rows) linked to their parent category_config IDs
- Update `display_order` for all 8 active food categories

### Step 3: Workflow Linkage Verification
- `cart_purchase` → already has workflow flows (no changes needed)
- `request_service` → already mapped for Party & Bulk (via `listing_type_workflow_map`)
- `contact_enquiry` → already mapped for Free/Sharing (via `contact_only` listing type)

### Key Behavior Flags by Category

| Category | show_veg_toggle | supports_cart | requires_delivery | is_physical_product |
|----------|----------------|---------------|-------------------|---------------------|
| Home-Cooked Meals | ✅ | ✅ | ✅ | ✅ |
| Snacks | ✅ | ✅ | ✅ | ✅ |
| Sweets & Desserts | ✅ | ✅ | ✅ | ✅ |
| Beverages | ✅ | ✅ | ✅ | ✅ |
| Homemade Products | ❌ | ✅ | ✅ | ✅ |
| Party & Bulk | ✅ | ❌ | ❌ | ❌ |
| Specialty Food | ✅ | ✅ | ✅ | ✅ |
| Free / Sharing | ❌ | ❌ | ❌ | ❌ |

### No Code Changes Needed
- The entire system (seller product forms, buyer discovery, category grids, workflow engine) reads from `category_config` and `subcategories` tables dynamically
- Admin CategoryManager already supports editing/reordering these rows
- Filters (veg/non-veg) already exist and are driven by `show_veg_toggle`

