

# Fix: Add Missing `subcategory_preferences` Column

## Problem
The error `Could not find the 'subcategory_preferences' column of 'seller_profiles' in the schema cache` means the column was never created in your live database, even though the code already references it everywhere.

## Root Cause
Your project has the migration file and all the application code, but the actual `ALTER TABLE` was never executed against your Supabase database.

## Fix
One SQL statement — no code changes needed:

```sql
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS subcategory_preferences jsonb DEFAULT '{}';
```

Run this in the [Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new). The error will disappear immediately.

