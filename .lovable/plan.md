

# Fix: Delivery Fee Ignores Admin-Set ₹0 — Falsy-Zero Bug

## Root Cause

The bug is a classic JavaScript falsy-zero problem. When the admin sets `base_delivery_fee` to `0`, the parsing logic does this:

```js
parseInt(map.base_delivery_fee || '20', 10) || 20
//       ↑ '0' is truthy, passes      ↑ parseInt('0') = 0, which is FALSY → falls back to 20!
```

`parseInt('0')` returns `0`. In JavaScript, `0 || 20` evaluates to `20` because `0` is falsy. So the admin's configured value of `0` is **always overridden** by the hardcoded fallback `20`.

This same bug affects **every numeric setting** that uses the `|| default` pattern — delivery fee, thresholds, filters, etc.

## Fix

Replace `||` (logical OR) with `??` (nullish coalescing) for all numeric parsing. `??` only falls back when the value is `null` or `undefined`, not when it's `0`.

### 1. `src/hooks/useSystemSettings.ts` — `buildSettingsFromMap()`

```ts
// Before (broken):
baseDeliveryFee: parseInt(map.base_delivery_fee || '20', 10) || 20,

// After (correct):
baseDeliveryFee: map.base_delivery_fee != null ? parseInt(map.base_delivery_fee, 10) : 20,
```

Apply to all numeric fields: `baseDeliveryFee`, `freeDeliveryThreshold`, `platformFeePercent`, `budgetFilterThreshold`, `maxPriceFilter`, `refundSlaHours`.

### 2. `src/hooks/useMarketplaceConfig.ts` — `buildConfig()`

Same fix for `lowStockThreshold` and `maxBadgesPerCard`.

### 3. `supabase/functions/manage-delivery/index.ts` — delivery fee lookup

```ts
// Before:
const baseFee = parseInt(settingsMap.base_delivery_fee || '20', 10) || 20;

// After:
const baseFee = settingsMap.base_delivery_fee != null
  ? parseInt(settingsMap.base_delivery_fee, 10)
  : 20;
```

Same fix for `freeThreshold`.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useSystemSettings.ts` | Fix 6 numeric fields to use null-check instead of `\|\|` |
| `src/hooks/useMarketplaceConfig.ts` | Fix 2 numeric fields |
| `supabase/functions/manage-delivery/index.ts` | Fix 2 numeric fields |

## Why This Is Bulletproof

- `0` is now a valid admin-configured value
- Only falls back to defaults when the key is genuinely missing from the database
- No other code changes needed — the consuming code (`useCartPage.ts`, `FulfillmentSelector`, etc.) already works correctly with `0`

