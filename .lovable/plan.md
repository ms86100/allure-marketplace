

# Fix Admin Page Crash + Assign Admin Role

## Two Issues Found

### Issue 1: Admin Role Not Assigned
Your phone number `9535115316` exists in `auth.users` but has no admin role in `user_roles`. Without this, `isAdmin` is `false` and you'd normally be redirected — but the lazy component error crashes before the redirect logic runs.

**Fix**: Run this SQL in the [Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new):

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE phone LIKE '%9535115316'
ON CONFLICT (user_id, role) DO NOTHING;
```

### Issue 2: Lazy Component Crash (React Error #306)
The error `"Element type is invalid. Received a promise that resolves to: undefined"` is a React lazy loading issue caused by stale Vite module cache after the many `types.ts` hot-reloads. The `AdminPage` file and all its imports are valid — this is a runtime cache problem.

**Fix**: After assigning the admin role, **hard-refresh the preview** (Ctrl+Shift+R / Cmd+Shift+R) to clear stale module state.

### Issue 3: Missing Database Column
Console shows `column featured_items.target_society_ids does not exist`. This needs a migration:

```sql
ALTER TABLE public.featured_items 
ADD COLUMN IF NOT EXISTS target_society_ids uuid[] DEFAULT '{}';
```

## Execution Order
1. Run the admin role SQL
2. Run the missing column SQL  
3. Hard-refresh the browser
4. Navigate to `#/admin`

No code changes needed — this is entirely a database + browser cache issue.

