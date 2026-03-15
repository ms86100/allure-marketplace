

# Fix: Null Society Name in Nearby Societies Section

## Problem
In `useStoreDiscovery.ts` L134, sellers without a linked society have `society_name: null` from the RPC. The code uses `s.society_name` as a grouping key, so null values become the string `"null"` when used as an object key. This renders as the literal text "null" in the UI at `ShopByStoreDiscovery.tsx` L142.

## Fix

**File: `src/hooks/queries/useStoreDiscovery.ts` (L134)**

Change the grouping key to fall back to a meaningful label when `society_name` is null:

```ts
const key = s.society_name || 'Independent Stores';
```

This ensures sellers without a society are grouped under "Independent Stores" instead of "null".

**One-line change. No other files affected.**

