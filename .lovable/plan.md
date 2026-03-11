

# Separate Browsing Location from Delivery Address

## Current State — What's Wrong

The system conflates browsing location with delivery address:

1. **No delivery address selection at checkout.** The cart page hardcodes `delivery_address` as `profile.block + profile.flat_number` (line 102 of `useCartPage.ts`). There's no `AddressPicker` on the checkout page.

2. **Orders table has no coordinate columns.** `delivery_address` is a plain text column. No `delivery_address_id`, `delivery_lat`, or `delivery_lng` exist. Sellers cannot navigate to the buyer.

3. **No delivery radius validation.** Before placing an order, the system never checks whether the delivery address is within the seller's `delivery_radius_km`.

4. **`AddressPicker` component exists but is unused at checkout.** It's only referenced in profile editing.

5. **Cart location guard clears cart on location switch** — but this is about browsing location. It should NOT affect the delivery address, which is chosen at checkout.

## Architecture

```text
CURRENT:
  BrowsingLocation → discovery + checkout delivery_address (WRONG)
  profile.block/flat → delivery_address text

PROPOSED:
  BrowsingLocation → discovery ONLY
  delivery_addresses table → checkout address selection
  orders.delivery_address_id + delivery_lat + delivery_lng → fulfillment
```

## Plan — 7 Changes

### 1. Database Migration: Add delivery coordinate columns to orders
Add three columns to the `orders` table:
- `delivery_address_id uuid` (nullable FK to `delivery_addresses`)
- `delivery_lat double precision`
- `delivery_lng double precision`

No data migration needed — existing orders keep their text `delivery_address`.

### 2. Update `create_multi_vendor_orders` RPC
Add three new parameters: `_delivery_address_id uuid`, `_delivery_lat double precision`, `_delivery_lng double precision`. Store them in the orders INSERT. Also add a **delivery radius check**: before inserting each order, compare `haversine_km(delivery_lat, delivery_lng, seller_society_lat, seller_society_lng)` against `seller.delivery_radius_km`. If outside radius and fulfillment is delivery, return error.

### 3. Add delivery address state to `useCartPage`
- Add `selectedDeliveryAddress` state (from `useDeliveryAddresses`)
- Auto-select default address on mount
- When fulfillment = delivery, require `selectedDeliveryAddress` with valid lat/lng
- Pass `delivery_address_id`, `delivery_lat`, `delivery_lng` to the RPC
- Keep building `delivery_address` text from the selected address fields (backward compatible)

### 4. Add AddressPicker to CartPage checkout UI
Replace the static "Deliver to" section (lines 187-200 of `CartPage.tsx`) with:
- When `fulfillment = delivery`: show `AddressPicker` sheet allowing user to select from saved addresses
- Show selected address details (label, flat, block, building)
- "Change" button opens the picker
- If no addresses exist, show "Add delivery address" button linking to profile
- If selected address has no coordinates, show warning

### 5. Pre-checkout delivery radius validation
In `handlePlaceOrderInner`, when fulfillment = delivery:
- Get seller's society coordinates and `delivery_radius_km`
- Calculate distance from `selectedDeliveryAddress.lat/lng` to seller coordinates
- If outside radius, show toast: "{SellerName} does not deliver to this address ({distance} km away, max {radius} km)"
- Block order placement

### 6. Remove browsing-location dependency from checkout
- Remove the line that builds `delivery_address` from `profile.block + profile.flat_number`
- Remove the profile-field validation (`!profile.block || !profile.flat_number`) that currently gates delivery orders
- The "Deliver to" section should show the selected delivery address, not profile fields

### 7. Update cart location guard behavior
The existing 2km cart-clear warning in `BrowsingLocationContext` remains valid for **discovery** (sellers change when you move). But the delivery address is now independently chosen at checkout, making the system correct:
- Browsing = what you see
- Delivery address = where you receive

No change needed to the guard itself — it correctly protects discovery context.

## Files Changed
- **1 migration**: Add columns + update RPC
- `src/hooks/useCartPage.ts`: Add delivery address state, pass to RPC, radius validation
- `src/pages/CartPage.tsx`: Integrate `AddressPicker` at checkout
- `src/components/profile/AddressPicker.tsx`: Minor enhancement (show coordinates warning)

## What This Does NOT Change
- Browsing location logic (stays as-is)
- Discovery hooks (stays as-is)
- Cart location guard (stays as-is, still useful for discovery)
- Self-pickup flow (no delivery address needed)

