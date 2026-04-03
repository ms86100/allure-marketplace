

# Make License Requirements Dynamic at Category Level

## Problem

License configuration currently works only at the **parent group** level (e.g., "Personal Care"). This means if the admin enables licenses for Personal Care, ALL categories under it (Beauty, Salon, Yoga, Ayurveda) require the same license — but Ayurveda needs a practitioner certificate while Beauty may not need one at all.

## Solution

Move license configuration from `parent_groups` to `category_config`, so each category can independently have its own license requirement. The admin License Config tab will show individual categories (grouped by parent) instead of just parent groups.

## Implementation

### Step 1: DB Migration — Add license columns to `category_config`

Add 4 columns to `category_config`:
- `requires_license` (boolean, default false)
- `license_type_name` (text, nullable) — e.g., "Ayurveda Practitioner Certificate"
- `license_description` (text, nullable) — instructions for sellers
- `license_mandatory` (boolean, default false) — blocks selling until approved

Migrate existing data: copy license settings from `parent_groups` down to all `category_config` rows that belong to groups where `requires_license = true`.

### Step 2: Add `category_config_id` to `seller_licenses`

Add an optional `category_config_id` column (FK to `category_config`) to `seller_licenses`. Keep `group_id` for backward compatibility. New licenses will reference the specific category.

Update the product publish trigger to check licenses at the category level first, falling back to group level.

### Step 3: Update `LicenseConfigSection.tsx`

Replace the flat parent-group list with a **grouped view**:
- Show parent group as a section header
- Under each parent, show its categories from `category_config`
- Each category row gets its own `requires_license` toggle, Edit button, and Mandatory switch
- Admin can configure license requirements per-category independently

Data source: fetch from `category_config` (with license columns) + `parent_groups` (for grouping/headers), instead of just `parent_groups`.

### Step 4: Update `LicenseUpload.tsx` (Seller Side)

Change the seller's license upload component to:
- Accept `categoryConfigId` instead of (or in addition to) `groupId`
- Fetch license requirements from `category_config` instead of `parent_groups`
- When a seller selects categories during onboarding, show license upload prompts for each category that has `requires_license = true`

### Step 5: Update Seller Onboarding Flow

When sellers pick categories in `CategorySearchPicker`, check which selected categories require licenses. Show the `LicenseUpload` component for each one, so the seller sees exactly what's needed per category (e.g., "Ayurveda requires: Practitioner Certificate").

### Step 6: Update `useSellerApplicationReview.ts`

- Fetch `category_config` license data alongside parent groups
- License review in the admin panel should show which specific category the license is for
- Keep backward compatibility with existing `group_id`-based licenses

## Files Summary

| File | Action |
|---|---|
| Migration SQL | **Create** — add columns to `category_config`, add `category_config_id` to `seller_licenses`, update trigger |
| `src/components/admin/LicenseConfigSection.tsx` | **Modify** — grouped category-level view |
| `src/components/seller/LicenseUpload.tsx` | **Modify** — support `categoryConfigId` |
| `src/hooks/useSellerApplicationReview.ts` | **Modify** — fetch category-level license configs |
| Seller onboarding (BecomeSellerPage) | **Modify** — show per-category license prompts |

## What This Achieves

- Admin toggles license for "Ayurveda" independently of "Beauty" — even though both are under "Personal Care"
- When a new category is added to `category_config`, it automatically appears in the admin license tab (no hardcoding)
- Sellers see exactly which of their selected categories need a license
- Fully dynamic — everything driven by DB config

