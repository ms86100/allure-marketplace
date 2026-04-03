

# Add Ayurveda Category with Panchakarma Subcategories

## Current State

- **No Ayurveda category exists** in `category_config` — the enum `service_category` has no `ayurveda` value
- **Zero subcategories** exist for any personal_care or education_learning categories (subcategories only exist for food_beverages)
- The `service_booking` workflow is fully defined and working — Ayurveda services will use it
- The `ALIAS_MAP` in `CategorySearchPicker.tsx` currently maps "ayurveda", "therapy" etc. to `yoga` — incorrect once Ayurveda has its own category
- Adding subcategories to personal_care categories (Beauty, Salon, etc.) is also a gap but out of scope for this change

## What This Plan Does

1. Add `ayurveda` to the `service_category` enum
2. Insert a new `category_config` row for Ayurveda under `personal_care` with `transaction_type = 'service_booking'`
3. Insert subcategories covering Panchakarma programs, individual therapies, and complementary treatments
4. Update the search alias map so sellers typing "panchakarma", "ayurveda", "detox therapy" etc. land on the correct category
5. Add subcategories for existing service categories (Beauty, Salon, Yoga) so they also become searchable and selectable at the subcategory level

## Implementation

### Step 1: DB Migration — Add enum value + category_config + subcategories

**Migration SQL:**

```sql
-- 1. Add enum value
ALTER TYPE service_category ADD VALUE IF NOT EXISTS 'ayurveda';

-- 2. Insert category_config for Ayurveda
INSERT INTO category_config (
  category, display_name, icon, color, parent_group, layout_type,
  is_physical_product, requires_preparation, requires_time_slot, requires_delivery,
  supports_cart, enquiry_only, has_quantity, has_duration, has_date_range, is_negotiable,
  display_order, is_active, transaction_type, show_duration_field, show_veg_toggle,
  name_placeholder, description_placeholder, price_label, duration_label,
  primary_button_label, requires_availability, supports_addons, supports_staff_assignment
) VALUES (
  'ayurveda', 'Ayurveda & Wellness', 'Leaf', '#4CAF50', 'personal_care', 'service',
  false, false, true, false,
  false, false, false, true, false, false,
  15, true, 'service_booking', true, false,
  'e.g. Panchakarma Detox Program', 'Describe treatment, benefits, and duration',
  'Session Price', 'Session Duration',
  'Book Now', true, true, true
);
```

**Insert subcategories** (using the new category_config ID):

| slug | display_name | icon |
|---|---|---|
| panchakarma_detox | Panchakarma Detox Program | Sparkles |
| panchakarma_rejuvenation | Rejuvenation Therapy | Heart |
| abhyanga | Abhyanga (Oil Massage) | Droplets |
| shirodhara | Shirodhara | Brain |
| nasya_therapy | Nasya Therapy | Wind |
| basti_therapy | Basti Therapy | Pill |
| swedana | Swedana (Steam Therapy) | CloudRain |
| udwartana | Udwartana (Powder Massage) | Leaf |
| ayurvedic_consultation | Ayurvedic Consultation | Stethoscope |
| diet_lifestyle_plan | Diet & Lifestyle Plan | ClipboardList |

Also insert subcategories for **Beauty** (facial, bridal makeup, skin care, waxing, threading), **Salon** (haircut, hair coloring, beard trim, hair spa, grooming), and **Yoga** (hatha yoga, power yoga, prenatal yoga, meditation, pranayama) to make those categories equally searchable.

### Step 2: Code — Update `CategorySearchPicker.tsx`

- Move ayurveda-related aliases from `yoga` to `ayurveda`:
  - Remove: `'therapy'`, `'ayurvedic therapy'`, `'ayurveda'`, `'naturopathy'`, `'holistic healing'`
  - Keep on yoga: `'meditation'`, `'wellness'`, `'mindfulness'`, `'pranayama'`

- Add new `ayurveda` alias entry:
  ```
  ayurveda: ['panchakarma', 'ayurvedic therapy', 'ayurveda treatment', 'detox therapy',
             'oil massage', 'shirodhara', 'naturopathy', 'holistic healing',
             'body detox', 'wellness retreat', 'ayurvedic massage', 'herbal therapy',
             'stress relief therapy', 'therapy']
  ```

- Add alias entries for new subcategory slugs:
  ```
  panchakarma_detox: ['panchakarma', 'detox program', 'body detox', 'cleansing therapy']
  abhyanga: ['oil massage', 'body massage', 'ayurvedic massage', 'full body massage']
  shirodhara: ['head oil therapy', 'forehead oil', 'stress therapy']
  ```

- Add `'ayurveda'` to `POPULAR_SLUGS` array

- Add `'Panchakarma Therapy'` and `'Ayurveda'` to the typewriter placeholder rotation

### Step 3: No workflow changes needed

The `service_booking` workflow already supports: Requested → Confirmed → Scheduled → On the Way → Arrived → In Progress → Completed. This fits Ayurveda services perfectly.

## Files Summary

| File | Action |
|---|---|
| Migration SQL | **Create** — enum value + category_config row + ~30 subcategory rows |
| `src/components/seller/CategorySearchPicker.tsx` | **Modify** — update ALIAS_MAP, POPULAR_SLUGS, typewriter list |

## Gaps Identified (For Future)

- **No subcategories for remaining service categories** (Electrician, Plumber, Maid, etc.) — sellers can only select at category level, not specialize
- **No attribute blocks** for Ayurveda-specific metadata (dosha focus, contraindications) — would require the attribute engine to be extended
- **No consultation-first workflow** — Panchakarma programs ideally need a "Consult → Plan → Book" flow, but the current `service_booking` covers the booking part adequately for MVP

