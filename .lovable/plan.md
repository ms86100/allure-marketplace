

# Add Missing Service Feature Toggles to Subcategory Dialog

## The Problem

The **Category edit dialog** has three service feature toggles (Service Add-ons, Recurring Booking, Staff Assignment), but the **Subcategory add/edit dialog** does not. This is both a missing feature and a database schema gap — the `subcategories` table lacks the `supports_addons`, `supports_recurring`, and `supports_staff_assignment` columns entirely.

## What Will Change

### 1. Database Migration
Add three nullable boolean columns to the `subcategories` table:
- `supports_addons` (boolean, nullable, default null = inherit from parent category)
- `supports_recurring` (boolean, nullable, default null = inherit)
- `supports_staff_assignment` (boolean, nullable, default null = inherit)

### 2. Subcategory Manager UI (`SubcategoryManager.tsx`)
- Add the three service feature toggles to the subcategory add/edit dialog, placed after the existing "Configuration Toggles" section
- Use the same Inherit / Yes / No tri-state select pattern already used for `show_veg_toggle` and `show_duration_field`
- Update `SubcategoryFormData` interface and `INITIAL_FORM` to include the new fields
- Update the `handleSave` payload to persist the new fields

### 3. Subcategory Hook (`useSubcategories.ts`)
- Add the three new fields to the `Subcategory` interface

### Files to modify
- **Database**: Migration adding 3 columns to `subcategories`
- `src/components/admin/SubcategoryManager.tsx` — Form data, UI toggles, save payload
- `src/hooks/useSubcategories.ts` — Interface update

