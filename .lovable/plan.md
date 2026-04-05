

# Fix Admin Page Crash + Assign Admin Role

I found **three issues** — none require code changes. All are database + browser cache fixes.

## What's Wrong

1. **No admin role**: Your phone `9535115316` has no entry in `user_roles`, so `isAdmin` is `false`
2. **Stale module cache**: The "Element type is invalid" error is caused by stale Vite HMR cache after many `types.ts` hot-reloads. All source files and exports are valid.
3. **Missing column**: `featured_items.target_society_ids` doesn't exist in your database

## Fix — Run This SQL

Paste this into the [Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new):

```sql
-- 1. Assign admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE phone LIKE '%9535115316'
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Add missing column
ALTER TABLE public.featured_items 
ADD COLUMN IF NOT EXISTS target_society_ids uuid[] DEFAULT '{}';
```

## Then

- **Hard-refresh** the browser (Ctrl+Shift+R / Cmd+Shift+R) to clear stale module cache
- Navigate to `#/admin`

No code changes needed.

