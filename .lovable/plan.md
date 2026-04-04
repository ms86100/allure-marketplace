

# Assessment: What's Missing from the Add Product Flow

## Current State

The standalone Add Product page (`/seller/products/new`) renders `DraftProductManager` in `standalone` mode. It opens a **flat, single-page form** with all fields visible at once: name, price, category dropdown, description, image, veg toggle, attributes, stock, lead time.

## What's Missing (compared to onboarding)

### 1. No Subcategory Picker (Critical)
The form has a `subcategory_id` field in the data model but **zero UI to select it**. The `SubcategoryPickerDialog` — which provides the guided specialty picker with search, primary/secondary selection, and identity labels — is only used in `BecomeSellerPage` and `CategorySearchPicker`. The Add Product form never renders it.

**Impact**: Products are saved with `subcategory_id: null`, losing classification granularity (e.g., "Tiffin" vs "Breakfast" within Home-Cooked Meals).

### 2. No Progressive/Guided Steps (Major UX Gap)
Onboarding uses a **5-step stepper** with animated sub-steps (category → business details → configure → products → review). The Add Product page dumps everything into a single scrollable form — name, price, image, attributes, service fields, stock, lead time all stacked.

This makes the form feel overwhelming and inconsistent with the polished onboarding experience.

### 3. Category is a Plain `<select>` Dropdown
Onboarding uses the rich `CategorySearchPicker` with search scoring, alias mapping, icon-adorned category cards, and parent group filtering. The Add Product form uses a basic HTML `<select>` element (line 700-714).

### 4. No Contextual Guidance
Onboarding shows contextual cues like "Next: Choose how buyers will interact" and success encouragement. The standalone form has none of this progressive disclosure.

---

## Proposed Fix: Multi-Step Add Product Flow

Transform the standalone Add Product form into a **3-step guided flow** that reuses existing components:

### Step 1: What are you adding?
- **Category selector**: Show category pills (from seller's allowed categories) instead of a plain `<select>`. If only one category, auto-select and skip.
- **Subcategory picker**: After category selection, open `SubcategoryPickerDialog` to pick the subcategory. Show the selected subcategory as a chip/badge.
- Action type shown as read-only badge (inherited from store).

### Step 2: Product Details
- Name, price/MRP, description, image upload, veg toggle
- Attribute blocks (auto-populated from category defaults)
- This is the core form — same fields as today but focused.

### Step 3: Configuration & Review
- Service fields + availability schedule (if action type requires it)
- Stock management, lead time, pre-orders
- Live preview panel (already exists)
- Save button

### Implementation Approach

**File: `src/components/seller/DraftProductManager.tsx`**

In `standalone` mode, wrap the existing form sections in a local step state:

```text
┌─────────────────────────────────┐
│ Step indicator (1 · 2 · 3)      │
├─────────────────────────────────┤
│ Step 1: Category + Subcategory  │
│   - Category pills              │
│   - SubcategoryPickerDialog     │
│   - Action type badge           │
│   - [Continue]                  │
├─────────────────────────────────┤
│ Step 2: Product Details         │
│   - Name, Price, MRP            │
│   - Description, Image          │
│   - Veg toggle, Attributes      │
│   - [Back] [Continue]           │
├─────────────────────────────────┤
│ Step 3: Settings + Save         │
│   - Service config (if needed)  │
│   - Stock, Lead time            │
│   - Preview panel               │
│   - [Back] [Save Product]       │
└─────────────────────────────────┘
```

**Changes needed:**

| File | Change |
|------|--------|
| `DraftProductManager.tsx` | Add `formStep` state (standalone only). Split form into 3 sections with step navigation. Import + render `SubcategoryPickerDialog` in step 1. Replace `<select>` with styled category pills in standalone mode. Add dot-indicator progress UI. |
| `SellerAddProductPage.tsx` | Pass `categoryConfigs` (full config objects, not just names) so DraftProductManager can look up `categoryConfigId` for the subcategory picker. |
| No new files needed | Reuses existing `SubcategoryPickerDialog`, `CategorySearchPicker` patterns |

**Key details:**
- Step 1 auto-skips if seller has only 1 category and subcategory is already set (edit mode)
- Subcategory selection stored in `newProduct.subcategory_id`
- Category config ID resolved from `configs.find(c => c.category === selectedCategory)?.id`
- Draft persistence already covers all fields including `subcategory_id`
- Edit mode: pre-selects existing category + subcategory, allows changing

**What stays unchanged:**
- Onboarding mode (`mode='onboarding'`) — completely untouched
- All existing form fields and validation logic
- Save/update logic, DB triggers, action type enforcement
- Preview panels, attribute blocks, service fields

