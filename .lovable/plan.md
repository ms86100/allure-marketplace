

# Marketplace Architecture Audit Report

## SECTION 1: Current Implementation Status

### 1. COMMUNITY-FIRST LOGIC

| Check | Status | Reference |
|-------|--------|-----------|
| Residents see only their own society sellers | Implemented | `useHomeSellers.ts` -- all queries filter `.eq('society_id', effectiveSocietyId)` |
| No cross-society visibility unless enabled | Implemented | `useNearbySellers.ts` -- only runs when `browseBeyond === true` (buyer toggle) |
| Database filtering (not just frontend) | Partially Implemented | `useHomeSellers.ts` uses `.eq('society_id', ...)` at query level. The `search_nearby_sellers` RPC uses `SECURITY DEFINER` + excludes own society + checks `sell_beyond_community`. |
| API-level enforcement (RLS) | **CRITICAL GAP** | The `seller_profiles` SELECT policy allows **anyone** to see all approved sellers regardless of society (`verification_status = 'approved'`). This is acceptable since society filtering is done in queries. **However**, the `products` SELECT RLS policy **does enforce** `society_id = get_user_society_id(auth.uid())`, which **blocks cross-society product viewing entirely**. A buyer browsing a nearby seller cannot see their products. |

**Status: Partially Implemented** -- The products RLS policy blocks cross-society product visibility, breaking the entire cross-society marketplace feature.

### 2. SELLER VISIBILITY CONTROL

| Check | Status | Reference |
|-------|--------|-----------|
| `sell_beyond_community` (boolean) column | Implemented | DB column confirmed: `boolean NOT NULL DEFAULT false` |
| `delivery_radius_km` (integer) column | Implemented | DB column confirmed: `integer NOT NULL DEFAULT 5` |
| Toggle in onboarding wizard (Step 3) | Implemented | `BecomeSellerPage.tsx` lines 86-94, 192-194 |
| Editable in Seller Settings | Implemented | `SellerSettingsPage.tsx` lines 557-601, saved at line 240-241 |
| Radius range 1-10 km enforced in UI | Implemented | Both pages use `<Slider min={1} max={10} step={1}>` |
| Radius range enforced at DB level | **Not Implemented** | No CHECK constraint or validation trigger on `delivery_radius_km` to prevent values outside 1-10 |

**Status: Mostly Implemented** -- Missing DB-level range validation.

### 3. BUYER RADIUS SEARCH

| Check | Status | Reference |
|-------|--------|-----------|
| Default search from society lat/lng | Implemented | `search_nearby_sellers` RPC fetches `latitude, longitude` from buyer's `societies` row |
| Radius slider (1-10 km) | Implemented | `HomePage.tsx` lines 279-293 |
| Haversine formula for distance | Implemented | `haversine_km` SQL function using proper great-circle formula |
| Backend-level filtering | Implemented | `search_nearby_sellers` RPC applies `haversine_km() <= delivery_radius_km` AND `<= _radius_km` server-side |
| `browse_beyond_community` column on profiles | Implemented | DB column confirmed: `boolean NOT NULL DEFAULT false` |
| `search_radius_km` column on profiles | Implemented | DB column confirmed: `integer NOT NULL DEFAULT 5` |
| Buyer preference persisted to DB | **Not Implemented** | `HomePage.tsx` uses local `useState` only -- toggling "Browse beyond" does NOT save to the `profiles` table |

**Status: Mostly Implemented** -- Buyer preference not persisted.

### 4. SAME CART ARCHITECTURE (Multi-Vendor)

| Check | Status | Reference |
|-------|--------|-----------|
| Cart schema supports multi-seller | Partially | `cart_items` has `user_id, product_id, quantity` -- no seller restriction at DB level, but... |
| Cart enforces single-seller in code | **BLOCKING** | `useCart.tsx` line 72: `"You can only order from one seller at a time. Clear your cart first."` -- this **prevents** multi-seller cart entirely |
| Order splitting logic (multi sub-orders) | **Not Implemented** | `CartPage.tsx` `createOrder()` creates ONE order with `currentSellerId` -- no seller grouping/splitting |
| Payment splits per seller | **Not Implemented** | Single `payment_records` entry per order; no multi-seller split logic |
| Single checkout, multiple sub-orders | **Not Implemented** | Checkout flow assumes single seller throughout |

**Status: Not Implemented** -- Current architecture is explicitly single-seller cart. Multi-vendor order splitting does not exist.

### 5. VISIBILITY ENFORCEMENT RULES

| Rule | Status | Reference |
|------|--------|-----------|
| `sell_beyond = false` -> only same society | Implemented at query level | `search_nearby_sellers` checks `sp.sell_beyond_community = true`, so false sellers are excluded from cross-society results. Same-society queries use `society_id` filter. |
| `sell_beyond = true` -> visible within delivery radius | Implemented | RPC enforces `haversine_km() <= sp.delivery_radius_km` |
| Buyer "Go beyond" OFF -> same society only | Implemented at frontend | `useNearbySellers` has `enabled: browseBeyond` flag |
| Buyer "Go beyond" ON -> radius filter applied | Implemented | RPC uses `_radius_km` parameter |
| **Backend enforcement** of buyer toggle | **Not Implemented** | The buyer toggle is frontend-only state. A direct API call to `search_nearby_sellers` would work regardless of the buyer's preference since it's just a parameter. However, since the RPC requires explicit invocation, this is acceptable. |
| **Products RLS blocks cross-society** | **CRITICAL** | Products SELECT policy: `seller_profiles.society_id = get_user_society_id(auth.uid())` -- cross-society buyers CANNOT fetch products from nearby sellers |

**Status: Partially Implemented** -- The products RLS is the single biggest blocker.

---

## SECTION 2: Gaps Identified

### Critical (Breaks Core Functionality)

1. **Products RLS blocks cross-society visibility** -- The SELECT policy on `products` requires the seller's society to match the buyer's society. Cross-society product browsing is impossible. This breaks the entire "browse beyond community" feature.

2. **Cart is single-seller only** -- `useCart.tsx` explicitly rejects items from different sellers. Multi-vendor cart and order splitting are completely absent.

3. **No multi-seller order splitting** -- `CartPage.tsx` creates a single order tied to one seller. No logic to group cart items by seller and create separate sub-orders.

### Important (Should Fix)

4. **Buyer browse preference not persisted** -- The toggle state resets on page reload.

5. **No DB-level validation on delivery_radius_km** -- Values outside 1-10 can be inserted via direct API.

6. **No DB-level validation on search_radius_km** -- Same issue for buyer radius.

---

## SECTION 3: Implementation Plan

### Fix 1: Products RLS Policy (Critical)
Update the products SELECT policy to allow viewing products from cross-society sellers who have opted in and are within radius. Use a two-pronged approach:
- Same society: existing logic (always allowed)
- Cross society: allowed if seller has `sell_beyond_community = true` AND the seller's profile is approved

Since RLS cannot practically compute haversine distance (too expensive per-row), we rely on the `search_nearby_sellers` RPC for discovery and loosen the products RLS to allow viewing any product from an approved seller who has `sell_beyond_community = true`. The distance filtering happens at the search/discovery layer.

### Fix 2: Multi-Seller Cart (Critical)
- Remove single-seller restriction from `useCart.tsx`
- Update `CartPage.tsx` to group items by seller
- Create separate orders per seller during checkout (order splitting)
- Create separate payment records per seller

### Fix 3: Persist Buyer Browse Preference
- Save `browse_beyond_community` and `search_radius_km` to the `profiles` table when changed.

### Fix 4: DB Validation Triggers
- Add validation trigger on `seller_profiles` for `delivery_radius_km` (1-10)
- Add validation trigger on `profiles` for `search_radius_km` (1-10)

---

## SECTION 4: Code Changes Required

### Migration: Fix Products RLS

```sql
-- Drop existing restrictive policy
DROP POLICY "Anyone can view available products from approved sellers" ON products;

-- New policy: same society OR cross-society seller opted in
CREATE POLICY "Anyone can view available products from approved sellers"
ON products FOR SELECT USING (
  -- Seller owns the product
  EXISTS (
    SELECT 1 FROM seller_profiles
    WHERE seller_profiles.id = products.seller_id
      AND seller_profiles.user_id = auth.uid()
  )
  -- Admin
  OR is_admin(auth.uid())
  -- Same society
  OR EXISTS (
    SELECT 1 FROM seller_profiles
    WHERE seller_profiles.id = products.seller_id
      AND seller_profiles.verification_status = 'approved'
      AND seller_profiles.society_id = get_user_society_id(auth.uid())
  )
  -- Cross-society: seller opted in
  OR EXISTS (
    SELECT 1 FROM seller_profiles
    WHERE seller_profiles.id = products.seller_id
      AND seller_profiles.verification_status = 'approved'
      AND seller_profiles.sell_beyond_community = true
  )
);
```

### Migration: Radius Validation Triggers

```sql
CREATE OR REPLACE FUNCTION validate_delivery_radius()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.delivery_radius_km IS NOT NULL
     AND (NEW.delivery_radius_km < 1 OR NEW.delivery_radius_km > 10) THEN
    RAISE EXCEPTION 'delivery_radius_km must be between 1 and 10';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_delivery_radius
  BEFORE INSERT OR UPDATE ON seller_profiles
  FOR EACH ROW EXECUTE FUNCTION validate_delivery_radius();

CREATE OR REPLACE FUNCTION validate_search_radius()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.search_radius_km IS NOT NULL
     AND (NEW.search_radius_km < 1 OR NEW.search_radius_km > 10) THEN
    RAISE EXCEPTION 'search_radius_km must be between 1 and 10';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_search_radius
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION validate_search_radius();
```

### useCart.tsx Changes
- Remove the single-seller block (`"You can only order from one seller"`)
- Add a `sellerGroups` computed property that groups items by `seller_id`

### CartPage.tsx Changes
- Group items visually by seller
- On checkout, loop through seller groups and create one order per seller
- Create separate `payment_records` per seller
- Send notifications per seller

### HomePage.tsx Changes
- Persist `browse_beyond_community` and `search_radius_km` to DB on toggle/slider change using a debounced `supabase.from('profiles').update(...)` call

### Files to Modify
1. **New migration** -- Products RLS fix + validation triggers
2. **`src/hooks/useCart.tsx`** -- Remove single-seller restriction, add seller grouping
3. **`src/pages/CartPage.tsx`** -- Multi-seller UI grouping + order splitting in checkout
4. **`src/pages/HomePage.tsx`** -- Persist buyer browse preferences to DB
