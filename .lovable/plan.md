

# Fix: Add Missing `subcategory_preferences` Column

## Problem
The toast error "Could not find the 'subcategory_preferences' column of 'seller_profiles' in the schema cache" means this column was never created in your live database.

## Root Cause
The migration file exists in your codebase (`20260403094310_...sql`) and all application code already references this column — it just was never executed against your live Supabase database.

## Fix
A single SQL statement — **no code changes needed**:

```sql
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS subcategory_preferences jsonb DEFAULT '{}';
```

Run this in the **[Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new)**. The error will disappear immediately.

