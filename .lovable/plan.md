

# Fix: Auto-create service_listings fails due to missing RLS policies

## Root Cause (confirmed from DB schema inspection)

The `service_listings` table has **only one RLS policy**: `'Anyone can view service listings'` (SELECT). There are **zero INSERT, UPDATE, or DELETE policies**. 

This is why every attempt to auto-create default service_listings silently fails — the authenticated Supabase client is blocked by RLS, and the error gets swallowed as "Could not create service settings."

The reference project works because it has proper INSERT/UPDATE policies on this table, allowing sellers to upsert service_listings when saving products.

## Fix (2 steps)

### Step 1: Add RLS policies for `service_listings` (DB migration)

Add seller-scoped INSERT, UPDATE, and DELETE policies so that a seller can manage service_listings for products they own:

```sql
-- Sellers can insert service listings for their own products
CREATE POLICY "Sellers can insert own service listings"
ON service_listings FOR INSERT TO authenticated
WITH CHECK (
  product_id IN (
    SELECT p.id FROM products p
    JOIN seller_profiles sp ON sp.id = p.seller_id
    WHERE sp.user_id = auth.uid()
  )
);

-- Sellers can update their own service listings
CREATE POLICY "Sellers can update own service listings"
ON service_listings FOR UPDATE TO authenticated
USING (
  product_id IN (
    SELECT p.id FROM products p
    JOIN seller_profiles sp ON sp.id = p.seller_id
    WHERE sp.user_id = auth.uid()
  )
);

-- Sellers can delete their own service listings
CREATE POLICY "Sellers can delete own service listings"
ON service_listings FOR DELETE TO authenticated
USING (
  product_id IN (
    SELECT p.id FROM products p
    JOIN seller_profiles sp ON sp.id = p.seller_id
    WHERE sp.user_id = auth.uid()
  )
);
```

### Step 2: Fix invalid enum values in `service-slot-generation.ts`

The fallback defaults use values that don't match the DB defaults:
- Current: `service_type: 'appointment'` → Should be: `'scheduled'` (DB default)
- Current: `location_type: 'in_store'` → Should be: `'at_seller'` (DB default)

Also, since the DB has defaults for all columns, simplify the insert to only specify `product_id` and the fields that matter for slot generation (duration, buffer, capacity). Let the DB handle the rest.

Update `src/lib/service-slot-generation.ts` lines 115-126 to use correct values matching the DB schema defaults.

## Why this fixes it

```text
Before: Seller saves hours → auto-create service_listings → RLS blocks INSERT → silent failure → "Could not create service settings"

After:  Seller saves hours → auto-create service_listings → RLS allows (product belongs to seller) → slots generated → buyer sees slots
```

## Files changed

| File | Change |
|---|---|
| New DB migration | Add INSERT/UPDATE/DELETE RLS policies for `service_listings` |
| `src/lib/service-slot-generation.ts` | Fix `service_type` and `location_type` values to match DB defaults |

## What stays the same
- Buyer-side hook unchanged
- Store hours remain the schedule source
- Product form still works for customizing service settings
- `service_slots` policies already correct

