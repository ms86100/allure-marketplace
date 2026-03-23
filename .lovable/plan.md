

## Problem

You edited the **default** Seller Delivery workflow and enabled `is_transit` on the `preparing` step. However, there's a **Food Beverages override** for `seller_delivery` that still has `is_transit = false` on `preparing`. Since your seller (home_food) belongs to the `food_beverages` group, the system uses the override — not the default.

**The override badge IS in the UI** — under the Seller Delivery card, you should see a small clickable badge labeled **"Food Beverages · 10"**. Clicking it opens the override for editing.

## Two Options to Fix

### Option A: Edit the override directly (recommended)
1. Go to **Workflow Manager**
2. Find the **Seller Delivery** card
3. Below it, click the small badge **"Food Beverages · 10"**
4. This opens the override editor — enable `is_transit` on the `preparing` step
5. Save

### Option B: Delete the override
1. Click the **"Food Beverages · 10"** badge under Seller Delivery
2. Click the **Delete** button in the editor drawer header
3. Now all `food_beverages` sellers will fall back to the default workflow (which already has `is_transit` enabled)

## UI Improvement Plan

To prevent this confusion in the future, I'll make the override badges more prominent:

1. **`AdminWorkflowManager.tsx`** — Make override badges larger and more visible with an "Override" label prefix and a warning icon. Add a subtitle hint: *"Category-specific overrides take priority over the default"*

2. **Editor drawer** — When editing a default workflow that has overrides, show a warning banner: *"This workflow has X category overrides. Changes here won't affect overridden categories."*

### Files to modify
- `src/components/admin/AdminWorkflowManager.tsx` — Enhanced override badge styling + warning banner in editor

