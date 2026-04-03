

# Clarify Product Form Fields — Remove Duplication & Add Helper Text

## Problem

1. **Duplicate field**: `prep_time_minutes` ("Preparation Time") exists in BOTH the main product form AND the "Food Details" attribute block under "Extra Details" — confusing sellers
2. **Unclear labels**: "Hours in advance" (lead time) and "Prep Time" lack explanatory context
3. **No section grouping**: Lead time, pre-orders, stock tracking, and prep time are scattered without clear purpose headers

## What Each Field Actually Means

| Field | Meaning | Example |
|-------|---------|---------|
| **Prep Time** | How long to *make* the item once ordered | "30 min to cook biryani" |
| **Lead Time** | How far *in advance* buyer must order | "Order 2 hours before delivery" |
| **Stock Quantity** | How many units available right now | "10 plates available today" |
| **Low Stock Alert** | Notify seller when stock drops below this | "Alert me at 3 remaining" |

## Changes

### 1. Remove `prep_time_minutes` from `food_details` attribute block (DB update)
Remove the duplicate field from the `attribute_block_library` schema for `food_details`. The main form already captures this — having it in Extra Details causes double entry.

**Migration**: Update `attribute_block_library` row for `block_type = 'food_details'` to remove the `prep_time_minutes` field from its JSON schema.

### 2. Add helper text to main form fields

**File**: `src/pages/SellerProductsPage.tsx`

- **Prep Time field** (line 80): Add helper below: `"How long it takes to prepare once ordered"`
- **Lead Time field** (line 106): Change label from "Hours in advance" → "Order Lead Time (hours)" and add helper: `"Minimum advance notice buyers need to place an order"`
- **Stock section** (line 111): Add helper to "Track Stock Quantity": already has `"Auto-marks unavailable when stock hits zero"` ✅
- **Pre-orders toggle**: Already has `"Allow buyers to order for future dates"` ✅

### 3. Same changes in DraftProductManager (onboarding form)

**File**: `src/components/seller/DraftProductManager.tsx`

- **Prep Time** (line 684): Add helper text below the input
- **Lead Time** (line 739): Change label to "Order Lead Time (hours)", add helper text
- **Stock section**: Already has labels ✅

### 4. Group related fields with section headers

In both forms, add lightweight section labels:
- **"⏱ Preparation & Ordering"** above prep time + lead time + pre-orders
- **"📦 Stock Management"** above stock tracking

This visually separates "time-related" fields from "inventory" fields.

## Files Changed

| File | Change |
|------|--------|
| Migration | Remove `prep_time_minutes` from `food_details` block schema |
| `src/pages/SellerProductsPage.tsx` | Add helper text, rename labels, add section headers |
| `src/components/seller/DraftProductManager.tsx` | Same label/helper changes for onboarding form |

## Summary

- **Prep Time** = "How long to make it" (stays in main form only)
- **Lead Time** = "How early to order" (renamed + helper added)
- No more duplicate field in Extra Details
- Clear section grouping prevents confusion

