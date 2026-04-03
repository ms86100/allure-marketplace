

# Seller-Controlled Payment Configuration Per Fulfillment Type

## What We're Building

Sellers currently have a single "Cash on Delivery" and "UPI Payments" toggle that applies globally. We need per-fulfillment-type payment controls so a seller can, for example, require advance payment for self-pickup while allowing COD for delivery orders.

## Architecture

```text
seller_profiles
├── pickup_payment_config   jsonb  NOT NULL DEFAULT '{"accepts_cod":true,"accepts_online":true}'
├── delivery_payment_config jsonb  NOT NULL DEFAULT '{"accepts_cod":true,"accepts_online":true}'
├── accepts_cod             bool   (kept as fallback)
└── accepts_upi             bool   (kept as fallback)
```

A shared resolver function `resolvePaymentConfig(seller, fulfillmentType)` used everywhere.

## Implementation Steps

### 1. Database Migration
- Add `pickup_payment_config` and `delivery_payment_config` JSONB columns with NOT NULL + sensible defaults
- Backfill ALL existing sellers from their current `accepts_cod`/`accepts_upi` values
- Add a CHECK constraint: at least one of `accepts_cod` or `accepts_online` must be true in each config

### 2. Shared Payment Resolution Utility (`src/lib/resolvePaymentConfig.ts`)
Single canonical function used by cart, checkout, settings, and admin:
```ts
export function resolvePaymentConfig(
  seller: any,
  fulfillmentType: 'self_pickup' | 'delivery',
  paymentMode: { isRazorpay: boolean }
): { acceptsCod: boolean; acceptsOnline: boolean }
```
- Reads `pickup_payment_config` or `delivery_payment_config` based on fulfillment type
- Falls back to legacy `accepts_cod`/`accepts_upi` if JSONB is null
- For online: if Razorpay mode, always true regardless of seller UPI config; if UPI deep link mode, requires `accepts_upi && upi_id`

### 3. Cart Fetch (`src/hooks/useCart.tsx`)
- Add `pickup_payment_config, delivery_payment_config` to the seller profile select in `fetchCartItems` (line 112)

### 4. Checkout Logic (`src/hooks/useCartPage.ts`)
- Replace flat `acceptsCod`/`acceptsUpi` derivation (lines 208-214) with per-seller, per-fulfillment resolution using `resolvePaymentConfig`
- For multi-vendor carts: `acceptsCod = sellerGroups.every(g => resolve(g.seller, fulfillmentType).acceptsCod)`
- For `acceptsOnline`: same per-seller AND logic
- Validation: at least one method must be available; block checkout if not

### 5. Seller Settings UI (`src/pages/SellerSettingsPage.tsx`)
Replace the current flat "Payment Methods" section (lines 239-255) with fulfillment-aware config:
- When `fulfillment_mode = self_pickup`: show one payment config block ("Self Pickup Payment")
- When `fulfillment_mode = seller_delivery`: show one payment config block ("Delivery Payment")
- When `fulfillment_mode = pickup_and_seller_delivery`: show TWO blocks side by side
- Each block: "Allow Cash Payment" toggle + "Allow Online Payment" toggle
- Validation: at least one must be ON per block
- Keep legacy `accepts_cod`/`accepts_upi` synced from the active config for backward compat

### 6. Seller Settings Hook (`src/hooks/useSellerSettings.ts`)
- Add `pickup_payment_config` and `delivery_payment_config` to `SellerSettingsFormData`
- Load from DB profile, initialize from legacy fields if null
- Save both configs + sync legacy fields on save

### 7. Seller Onboarding (`src/hooks/useSellerApplication.ts`)
- Add payment config per fulfillment type to `SellerFormData`
- Default: both COD and online enabled for all types
- Save to DB on draft save and final submit

### 8. Backend Enforcement — Update `create_multi_vendor_orders` RPC
- Inside the per-seller loop (not just firstSeller), read the seller's payment config for the chosen `_fulfillment_type`
- Reject with structured error `payment_method_not_allowed` if the payment method doesn't match the seller's config
- Fallback to legacy fields if JSONB is null

### 9. PaymentMethodSelector — No structural changes
Already receives `acceptsCod`/`acceptsUpi` as props. Resolution happens upstream.

## Files Changed

| File | Change |
|------|--------|
| New migration | Add JSONB columns + backfill + constraint |
| `src/lib/resolvePaymentConfig.ts` | New shared resolver |
| `src/hooks/useCart.tsx` | Fetch new columns in seller join |
| `src/hooks/useCartPage.ts` | Per-seller, per-fulfillment payment resolution |
| `src/hooks/useSellerSettings.ts` | Add new fields to form, load/save |
| `src/pages/SellerSettingsPage.tsx` | Fulfillment-aware payment config UI |
| `src/hooks/useSellerApplication.ts` | Payment config in onboarding |
| RPC migration | Per-seller payment method validation |

## Edge Cases Handled

- **Mutual exclusivity safety**: UI prevents both toggles being OFF; DB constraint as backstop
- **Multi-vendor carts**: validated per-seller in loop, not just firstSeller
- **Missing UPI/Razorpay infra**: `acceptsOnline` is gated on payment infra availability
- **Null JSONB (old sellers)**: always falls back to legacy `accepts_cod`/`accepts_upi`
- **NOT NULL + DEFAULT**: no seller can ever have null config after migration

