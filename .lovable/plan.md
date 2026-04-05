

# Fix: Add Missing `subcategory_preferences` Column to `seller_profiles`

## Problem
The toast error "Could not find the 'subcategory_preferences' column of 'seller_profiles' in the schema cache" occurs because this column was never created in your live database, even though all the application code already uses it.

## Root Cause
The migration file exists in your project (`20260403094310_...sql`) but was never executed against the live Supabase database.

## Fix
A single database migration — no code changes needed:

```sql
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS subcategory_preferences jsonb DEFAULT '{}';
```

## How to Apply
Run this via the Supabase SQL Editor. After execution, the error disappears immediately — all code in `useSellerApplication.ts`, `useSellerSettings.ts`, `BecomeSellerPage.tsx`, and `CategorySearchPicker.tsx` already handles this column correctly.

