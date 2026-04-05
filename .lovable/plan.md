

# Fix Admin Page Crash + Assign Admin Role

## Two Issues Found

### Issue 1: Admin Role Not Assigned
Your phone number `9535115316` exists in `auth.users` but has no admin role in `user_roles`. Without this, `isAdmin` is `false` and the page crashes before redirect logic runs.

**Fix**: Run this SQL in the [Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new):

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE phone LIKE '%9535115316'
ON CONFLICT (user_id, role) DO NOTHING;
```

### Issue 2: Lazy Component Crash (Stale Cache)
The error `"Element type is invalid. Received a promise that resolves to: undefined"` is caused by stale Vite module cache after many `types.ts` hot-reloads. All files and exports are valid — this is a runtime cache issue.

**Fix**: After assigning the admin role, **hard-refresh the preview** (Ctrl+Shift+R / Cmd+Shift+R).

### Issue 3: Missing Database Column
Console shows `column featured_items.target_society_ids does not exist`. Run this alongside the role SQL:

```sql
ALTER TABLE public.featured_items 
ADD COLUMN IF NOT EXISTS target_society_ids uuid[] DEFAULT '{}';
```

## Steps
1. Run both SQL statements in Supabase SQL Editor
2. Hard-refresh the browser (Ctrl+Shift+R)
3. Navigate to `#/admin`

No code changes needed — this is entirely a database + browser cache fix.

