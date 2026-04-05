

# Fix: Add 'draft' to `verification_status` enum

The `verification_status` enum in your database is missing the `draft` value. Run this in the **[Supabase SQL Editor](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/sql/new)**:

```sql
ALTER TYPE public.verification_status ADD VALUE IF NOT EXISTS 'draft';
```

No code changes needed.

