

# Pre-Order Visibility + Flexible Scheduling for All Orders

## What Changes

### 1. Pre-order badge on ListingCard (listing grid)
`ListingCard` currently has no pre-order indicator. `ProductListingCard` already shows one.

**File:** `src/components/listing/ListingCard.tsx`
- Accept `accepts_preorders` and `lead_time_hours` in the `Listing` interface
- Render a small "Pre-order" badge (same style as `ProductListingCard`) on the image overlay when `accepts_preorders` is true

### 2. Pre-order label in cart items
Cart items currently show name + price but nothing to tell the buyer "this item requires scheduling."

**File:** `src/pages/CartPage.tsx` (lines 180-184)
- After the item name, check `(item.product as any)?.accepts_preorders`
- If true, render a small inline badge: `🕐 Pre-order` in accent color
- This makes it immediately obvious which items require a scheduled date

### 3. Optional scheduling toggle for non-pre-order carts
Currently the `PreorderDatePicker` only shows when `hasPreorderItems` is true. Non-pre-order buyers have no way to schedule.

**File:** `src/hooks/useCartPage.ts`
- Add state: `wantsScheduledDelivery` (boolean, default false)
- Expose it alongside existing pre-order values
- Adjust the guard: scheduling is required if `hasPreorderItems`, but optional (not blocking) when `wantsScheduledDelivery` and `!hasPreorderItems`
- Pass `scheduledDate`/`scheduledTime` to the RPC regardless — the RPC already accepts null values gracefully

**File:** `src/pages/CartPage.tsx` (around line 230)
- When `!hasPreorderItems`: show a toggle/switch: "Schedule for later?" 
- When toggled on, show the same `PreorderDatePicker` but with `leadTimeHours=0` (no minimum lead time) and no cutoff restriction
- The "Place Order" button is NOT blocked by missing date when this is optional — buyer can toggle off or leave it
- When `hasPreorderItems`: keep current mandatory behavior with the "(required)" label

### 4. No RPC changes needed
The `create_multi_vendor_orders` RPC already accepts `_scheduled_date` and `_scheduled_time_start` as nullable text. Non-pre-order scheduled orders will simply pass the selected date/time through. No migration required.

## Files Changed

| File | Change | Risk |
|------|--------|------|
| `src/components/listing/ListingCard.tsx` | Add `accepts_preorders` prop + badge | Zero |
| `src/pages/CartPage.tsx` | Pre-order label on cart items + optional schedule toggle | Low |
| `src/hooks/useCartPage.ts` | Add `wantsScheduledDelivery` state + expose | Zero |

## No breaking changes
- Pre-order mandatory scheduling stays exactly the same
- Non-pre-order orders default to immediate (toggle is off by default)
- RPC receives null when no schedule is selected — same as today

