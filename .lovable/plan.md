

# Bug: COD Always Disabled — Missing Fields in Cart Query

## Root Cause

The cart data query in `useCart.tsx` fetches seller profiles but **omits payment-related fields**. The seller join only selects:

```
id, business_name, user_id, is_available, availability_start, 
availability_end, operating_days, profile_image_url, cover_image_url, primary_group
```

**Missing fields**: `accepts_cod`, `accepts_upi`, `upi_id`, `fulfillment_mode`, `minimum_order_amount`

Then in `useCartPage.ts`, `firstSeller?.accepts_cod` returns `undefined`, and the fallback `?? false` makes COD appear disabled for **every** seller — regardless of their actual setting.

Fresh Mart Express has `accepts_cod: true` in the database. This is confirmed as a **bug**, not a seller configuration issue.

## Fix — `src/hooks/useCart.tsx`

Add the missing fields to the seller profile select in **both** query locations (lines 110 and 128):

**Before:**
```
seller:seller_profiles(id, business_name, user_id, is_available, 
  availability_start, availability_end, operating_days, 
  profile_image_url, cover_image_url, primary_group)
```

**After:**
```
seller:seller_profiles(id, business_name, user_id, is_available, 
  availability_start, availability_end, operating_days, 
  profile_image_url, cover_image_url, primary_group, 
  accepts_cod, accepts_upi, upi_id, fulfillment_mode, minimum_order_amount)
```

Two lines changed, same file. No other files need modification — `useCartPage.ts` already reads these fields correctly, it just wasn't receiving them.

| File | Change |
|------|--------|
| `src/hooks/useCart.tsx` (line 110) | Add `accepts_cod, accepts_upi, upi_id, fulfillment_mode, minimum_order_amount` to seller select |
| `src/hooks/useCart.tsx` (line 128) | Same addition (retry query) |

