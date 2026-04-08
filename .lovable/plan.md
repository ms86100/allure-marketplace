
# Concrete diagnosis: this is not mainly an RLS problem

## What I verified against the reference project

I compared your current project with `@project:d5ca2adc-cab2-4db4-ba43-65eca80aa4ab:"Block Eats Importer- Continue Editing"` in three places:

1. `src/hooks/useSellerApplication.ts`
2. `seller_profiles` unique indexes / migration history
3. `seller_profiles` RLS policies

## Confirmed root cause

Your app code is already trying to support multi-store by category group, but your live database is still enforcing the old one-store-per-user rule.

### Evidence

From your network logs, the insert fails with:

```text
duplicate key value violates unique constraint "seller_profiles_user_id_key"
```

That means the database still has this old unique constraint active:

```sql
UNIQUE (user_id)
```

But both your current codebase and the reference project expect this newer constraint instead:

```sql
UNIQUE (user_id, primary_group)
```

I also confirmed the reference project contains the migration:

```sql
ALTER TABLE public.seller_profiles DROP CONSTRAINT IF EXISTS seller_profiles_user_id_key;
ALTER TABLE public.seller_profiles ADD CONSTRAINT seller_profiles_user_group_key
  UNIQUE (user_id, primary_group);
```

and its schema export shows:

```sql
CREATE UNIQUE INDEX seller_profiles_user_group_key ON public.seller_profiles (user_id, primary_group);
```

So the backend mismatch is:

```text
Current live DB:
  unique(user_id)                    ← blocks any 2nd store

Reference project DB:
  unique(user_id, primary_group)     ← allows multiple stores across groups
```

## Why it is not primarily RLS

I checked the reference project's `seller_profiles` RLS and it has:

- SELECT policy
- INSERT policy with `WITH CHECK (user_id = auth.uid())`
- UPDATE policy

The INSERT policy is normal and not the blocker here.

Your runtime error is `23505 duplicate key`, not:
- `42501`
- `new row violates row-level security policy`
- permission denied

So the database is accepting the insert path up to constraint validation, then rejecting it because of the old uniqueness rule.

## Secondary backend mismatch also found

While tracing the same flow, I found another live-schema mismatch:

`BecomeSellerPage.tsx` queries:

```ts
category_config
  .select('requires_license, license_type_name, license_mandatory')
```

But your runtime network log shows:

```text
column category_config.requires_license does not exist
```

So your code expects newer `category_config` license columns, but your live DB is missing them.

This is separate from the duplicate-store blocker, but it confirms your backend is behind the reference project in more than one migration.

## Exact conclusion

The concrete backend blockers are:

1. `seller_profiles_user_id_key` still exists in the live DB
2. multi-store migration to `seller_profiles_user_group_key` was not fully applied
3. `category_config` license-related columns are also missing in the live DB

## Implementation plan

### 1. Fix the real multi-store blocker in Supabase
Apply the same seller constraint migration that exists in the reference project:

```sql
ALTER TABLE public.seller_profiles
DROP CONSTRAINT IF EXISTS seller_profiles_user_id_key;

ALTER TABLE public.seller_profiles
DROP CONSTRAINT IF EXISTS seller_profiles_user_group_key;

ALTER TABLE public.seller_profiles
ADD CONSTRAINT seller_profiles_user_group_key
UNIQUE (user_id, primary_group);
```

This is the main fix for:

```text
This entry already exists. Please try a different value.
```

### 2. Align the missing category_config backend columns
Apply the reference-project schema changes for:

- `requires_license`
- `license_type_name`
- `license_mandatory`
- likely `license_description` too, since nearby admin code expects it

Without this, seller onboarding will continue hitting 400 errors when loading license requirements.

### 3. Verify no stale draft logic masks the issue
After backend alignment, re-check the onboarding flow:
- first store still works
- second store in a different `primary_group` works
- second store in the same `primary_group` is correctly blocked
- draft save no longer throws `seller_profiles_user_id_key`

### 4. Keep the current hook logic
`useSellerApplication.ts` is already aligned with the reference project on the group-conflict redirect behavior. The remaining blocker is backend drift, not frontend logic.

## Technical details

```text
Current observed runtime:
  POST /seller_profiles
  -> 409
  -> code 23505
  -> duplicate key violates "seller_profiles_user_id_key"

Meaning:
  DB still enforces one seller profile per user

Reference expected state:
  seller_profiles_user_group_key (user_id, primary_group)

Result:
  user can own multiple stores, but only one per group
```

## What I would implement next
- add a Supabase migration that replaces `seller_profiles_user_id_key` with `seller_profiles_user_group_key`
- add missing `category_config` license columns to match the reference backend
- then re-verify the seller onboarding flow end-to-end against the reference behavior
