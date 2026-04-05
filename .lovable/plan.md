

# Fix: Add Missing `subcategory_preferences` Column

## What's Wrong
The toast error says the `subcategory_preferences` column doesn't exist on `seller_profiles`. Your code already uses it everywhere — the column just was never created in the live database.

## Fix
One database migration — no code changes needed:

```sql
ALTER TABLE public.seller_profiles
ADD COLUMN IF NOT EXISTS subcategory_preferences jsonb DEFAULT '{}';
```

Run this in the **[Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new)**. The error will disappear immediately.

