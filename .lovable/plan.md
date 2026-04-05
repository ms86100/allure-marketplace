

# Fix: Add Missing `subcategory_preferences` Column

## Problem
The toast error "Could not find the 'subcategory_preferences' column of 'seller_profiles' in the schema cache" means this column was never created in your live database.

## Root Cause
The migration file already exists in your codebase (`supabase/migrations/20260403094310_...sql`) and all application code already reads/writes this column correctly. The migration was simply never executed against your live Supabase database.

## Fix
**No code changes needed.** Run this single SQL statement in the **[Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new)**:

```sql
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS subcategory_preferences jsonb DEFAULT '{}';
```

Refresh the page after running it — the error will disappear immediately.

