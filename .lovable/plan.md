

# Fix: Buyer Order Cancellation Broken

## Root Cause (Two Issues)

### Issue 1: `useStatusTransitions` has NO fallback to `'default'`
The flow hook (`useCategoryStatusFlow`) falls back to `'default'` parent_group when no rows exist for a specific group. But `useStatusTransitions` does NOT — it returns an empty array. This means `canBuyerCancel` is always `false` for any seller whose `parent_group` lacks explicit transition rows (e.g., `food_delivery`, any new category).

This is the main reason cancellation "stopped working" — the flow loads (via fallback) but transitions don't.

### Issue 2: Missing `buyer → cancelled` from `accepted`
Even for the `default` group, the DB only allows buyer cancellation from `placed`. The old hardcoded check in `OrderCancellation.tsx` allowed `['placed', 'accepted']`, masking this gap. Now that the system is fully DB-driven, the missing transition means buyers can't cancel after a seller accepts.

## Fix Plan

### Fix 1: Add fallback to `useStatusTransitions`
Mirror the same fallback logic from `useCategoryStatusFlow`: try the specific `parent_group` first, if no rows found, retry with `'default'`.

**File:** `src/hooks/useCategoryStatusFlow.ts` — `useStatusTransitions` function

### Fix 2: Add missing buyer cancellation transitions
Insert `buyer → cancelled` from `accepted` for `cart_purchase`, `seller_delivery`, and `self_fulfillment` in the `default` parent_group.

**Method:** Database migration

### Files to Modify
1. `src/hooks/useCategoryStatusFlow.ts` — Add fallback to `useStatusTransitions`
2. Database migration — Insert missing buyer cancellation transitions from `accepted`

