

# Real Category & Subcategory Activation — Production Plan

## Current State (From DB Audit)

**11 parent groups** exist, but only **Food & Beverages is active** (8 active subcategories).
The other 10 groups (59 subcategories) are all `is_active: false`.

**Critical gap**: 5 of the 9 `transaction_type` values used in `category_config` have **NO workflow defined** in `category_status_flows` or `category_status_transitions`:

| Orphan transaction_type | Used by categories | Must map to |
|---|---|---|
| `book_slot` | yoga, dance, music, coaching, pest_control, beauty, mehendi, salon | `service_booking` (identical flow) |
| `buy_now` | furniture | `cart_purchase` (same buy flow) |
| `contact_only` | maid, cook, driver, nanny, ac_service, appliance_repair | `contact_enquiry` (same contact flow) |
| `request_quote` | carpenter, tailoring, catering, decoration | `request_service` (enquire→quote→accept) |
| `schedule_visit` | flat_rent, roommate, parking | `contact_enquiry` (contact→respond→done) |

If admin toggles any of these ON today, orders would fail because the workflow engine cannot resolve their status flows.

## Plan (3 Steps)

### Step 1: Fix Transaction Type Alignment (Data Update)

UPDATE all 27 orphan-type categories to use existing valid workflows:

```text
book_slot      → service_booking   (13 categories)
buy_now        → cart_purchase     (1 category)  
contact_only   → contact_enquiry   (6 categories)
request_quote  → request_service   (4 categories)
schedule_visit → contact_enquiry   (3 categories)
```

This is a data-only change — no schema migration needed. After this, every category maps to a real workflow with flows + transitions.

### Step 2: Activate Parent Groups + Subcategories (Data Update)

Activate the most relevant parent groups (6 of 11) and their subcategories in a single batch. This gives ~80% real-world coverage:

**Groups to activate (set `is_active = true` in `parent_groups`):**

| Group | Subcategories to activate | Workflow |
|---|---|---|
| `education_learning` | yoga, dance, music, fitness, art_craft, language, coaching, tuition | `service_booking` |
| `home_services` | electrician, plumber, carpenter, pest_control, appliance_repair | `request_service` / `service_booking` |
| `personal_care` | beauty, salon, mehendi, tailoring, laundry | `service_booking` / `request_service` / `cart_purchase` |
| `domestic_help` | maid, cook, nanny, driver | `contact_enquiry` |
| `shopping` | clothing, electronics, books, toys, kitchen, furniture | `cart_purchase` |
| `events` | catering, decoration, photography, dj_music | `request_service` |

**Groups to keep inactive** (niche, activate later): `pets`, `rentals`, `real_estate`, `professional`

### Step 3: Enrich Subcategory Metadata (Data Update)

Update form hints, placeholders, and behavior flags for activated categories so sellers get proper guidance:

- **Service categories**: Set `show_duration_field = true`, `duration_label`, `price_label = "Price per session"`, `primary_button_label = "Book Now"`
- **Shopping categories**: Set `has_quantity = true`, `is_physical_product = true`, `requires_delivery = true`, `supports_cart = true`, `primary_button_label = "Add to Cart"`
- **Contact/enquiry categories**: Set `enquiry_only = true`, `primary_button_label = "Contact Seller"`
- **Food categories**: Already correctly configured (no changes)

### No Code Changes Needed

The entire frontend already reads from `category_config` and `parent_groups` dynamically. The `ParentGroupTabs`, `CategoryImageGrid`, `CategoryBrowseGrid`, seller registration, product forms — all are DB-driven. Activating rows in the database instantly surfaces them in the UI.

### Safety Checks

1. Every activated category will have a valid `transaction_type` that exists in `category_status_flows`
2. `category_status_transitions` already cover all mapped workflow types
3. No enum changes needed — `category` column is TEXT
4. Existing food_beverages data is untouched
5. Admin can deactivate any category with a single `is_active = false` toggle

### Execution Order

1. Fix transaction_type alignment (UPDATE 27 rows in `category_config`)
2. Activate parent groups (UPDATE 6 rows in `parent_groups`)
3. Activate subcategories + enrich metadata (UPDATE ~35 rows in `category_config`)

All three steps are data UPDATEs — no migrations, no schema changes, no code changes.

