

# End-to-End Builder & Resident Management Plan

## Problem Statement

The current admin panel lets you **create a builder** and **assign a feature package**, but is missing two critical management capabilities:

1. **No way to add team members to a builder** -- The `builder_members` table exists, but there's no admin UI to assign a user as a builder team member. This means a builder user can never log in and see the Builder Dashboard.

2. **No way to assign societies to a builder** -- The `builder_societies` table exists, but there's no admin UI to link a society to a builder. Without this, builders have no societies in their portfolio, and the feature monetization hierarchy (Package -> Builder -> Society) doesn't cascade.

Without these two pieces, the full flow cannot work:
- Admin creates builder (works)
- Admin assigns package to builder (works)
- Admin assigns a user as builder member (MISSING)
- Admin assigns societies to builder (MISSING)
- Builder logs in and sees their dashboard with societies (blocked)
- Resident of that society sees features gated by the builder's package (blocked)

## Solution

### 1. Builder Management Sheet (new component)

Create `src/components/admin/BuilderManagementSheet.tsx` -- a sheet that opens when you click on a builder assignment card. It will have two sections:

**a) Members Tab**
- Shows current builder members (from `builder_members` table)
- "Add Member" form: search for a user by email/name from `profiles`, then insert into `builder_members` with a role (admin/viewer)
- Remove member button (delete from `builder_members`)

**b) Societies Tab**  
- Shows societies currently linked to this builder (from `builder_societies`)
- "Link Society" form: dropdown of all societies not yet assigned to any builder, insert into `builder_societies`
- Unlink society button (delete from `builder_societies`)

### 2. Integration into FeatureManagement

Update the Assignments tab in `src/components/admin/FeatureManagement.tsx`:
- Each builder assignment card gets a "Manage" button that opens the new `BuilderManagementSheet`
- The sheet receives the `builder_id` and `builder_name` as props

### 3. RLS Policy for builder_societies INSERT

Currently only platform admins can insert into `builder_societies`. A migration will ensure the INSERT policy exists:

```sql
-- Ensure admins can insert into builder_societies
CREATE POLICY IF NOT EXISTS "Admins can manage builder societies"
ON public.builder_societies FOR ALL
USING (public.is_admin(auth.uid()));
```

### 4. RLS Policy for builder_members INSERT

Same for `builder_members` -- ensure the admin INSERT policy covers all operations.

## Technical Details

### New File
- `src/components/admin/BuilderManagementSheet.tsx`

### Modified Files
- `src/components/admin/FeatureManagement.tsx` -- Add "Manage" button per assignment card, import and render `BuilderManagementSheet`

### Database Migration
- Ensure INSERT policies on `builder_societies` and `builder_members` for admins (likely already covered by the existing `FOR ALL` policy, but will verify and add if missing)

### Data Flow After Implementation

```text
Admin Panel > Features Tab > Assignments
  |
  +-- "Add Builder" -> CreateBuilderSheet (exists)
  +-- "Assign Package" -> Package assignment (exists)  
  +-- "Manage" -> BuilderManagementSheet (NEW)
        |
        +-- Members Tab: Add/remove users as builder members
        +-- Societies Tab: Link/unlink societies to builder
```

### End-to-End Test Flow

1. Admin creates a builder (e.g., "Shriram Properties")
2. Admin assigns a feature package (e.g., "Pro Plan")
3. Admin clicks "Manage" on the assignment card
4. Admin adds a user as a builder member (the builder's login account)
5. Admin links "Shriram Greenfield Phase-2" society to this builder
6. Builder user logs in -> sees Builder Dashboard with their society
7. Resident of that society -> sees features gated by the Pro Plan package
8. Society admin -> can only toggle features marked as `society_configurable` within the package scope

