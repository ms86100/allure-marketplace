

# Fix: Add Missing `subcategory_preferences` Column

## Problem
The error `Could not find the 'subcategory_preferences' column of 'seller_profiles' in the schema cache` means the migration `20260403094310` that adds this column was never applied to your live database.

## Root Cause
Your project already has the migration file (`supabase/migrations/20260403094310_...sql`) and all the code that reads/writes `subcategory_preferences`. The column simply doesn't exist in the database yet.

## Fix
Run a single database migration:

```sql
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS subcategory_preferences jsonb DEFAULT '{}';
```

That's it. No code changes needed — the column is already referenced correctly throughout `useSellerApplication.ts`, `useSellerSettings.ts`, `BecomeSellerPage.tsx`, and `CategorySearchPicker.tsx`.

