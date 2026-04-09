

# Fix: "Failed to create coupon" — Missing Columns in `coupons` Table

## Root Cause

The `coupons` table was manually altered (outside of migrations) to rename `starts_at` → `valid_from` and `expires_at` → `valid_until`. Additionally, the columns `description` and `show_to_buyers` were never added to the table.

The frontend `CouponManager.tsx` inserts these non-existent columns:
- `expires_at` (table has `valid_until`)
- `show_to_buyers` (does not exist)
- `description` (does not exist)

The RLS SELECT policy also references `expires_at` and `starts_at` — columns that no longer exist — which silently breaks reads too.

## Fix: Migration to align the database with the frontend

A single migration that:

1. **Adds missing columns**: `description text`, `show_to_buyers boolean DEFAULT true`
2. **Renames columns back** to match the frontend and the original migration: `valid_from` → `starts_at`, `valid_until` → `expires_at`
3. **Recreates the RLS SELECT policy** using the correct column names (already correct in the policy text, just needs the columns to exist)

```sql
-- Add missing columns
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS show_to_buyers boolean NOT NULL DEFAULT true;

-- Rename back to match frontend and original migration
ALTER TABLE public.coupons RENAME COLUMN valid_from TO starts_at;
ALTER TABLE public.coupons RENAME COLUMN valid_until TO expires_at;
```

## No frontend changes needed

The `CouponManager.tsx` and `CouponInput.tsx` already use the correct column names (`starts_at`, `expires_at`, `description`, `show_to_buyers`). Once the table schema matches, inserts and reads will work.

## Files changed

| File | Change |
|---|---|
| New migration SQL | Adds `description`, `show_to_buyers` columns; renames `valid_from`→`starts_at`, `valid_until`→`expires_at` |

