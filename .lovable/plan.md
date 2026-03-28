

# Fix all migration return-type conflicts

## Problem
PostgreSQL does not allow `CREATE OR REPLACE FUNCTION` to change a function's `RETURNS TABLE` column list. Two migrations hit this exact error during `supabase start` / `supabase db reset`.

## Confirmed conflicts (2 files to edit)

### 1. `get_effective_society_features(uuid)` — 4 cols → 7 cols
- **Original**: migration `20260214090333` defines it with 4 return columns
- **Breaks at**: migration `20260222123058` tries to redefine it with 7 return columns (adds `display_name`, `description`, `icon_name`) — no `DROP` first
- **Fix**: Add one line before the `CREATE OR REPLACE` in `20260222123058`:
  ```sql
  DROP FUNCTION IF EXISTS public.get_effective_society_features(UUID);
  ```

### 2. `get_seller_trust_snapshot(uuid)` — 5 cols (integer) → 6 cols (bigint)
- **Original**: migration `20260215080825` defines it with 5 integer columns
- **Breaks at**: migration `20260313110346` redefines it with 6 bigint columns (adds `cancelled_orders`, changes types) — no `DROP` first
- **Fix**: Add one line before the `CREATE OR REPLACE` in `20260313110346`:
  ```sql
  DROP FUNCTION IF EXISTS public.get_seller_trust_snapshot(UUID);
  ```

## Why only these two?
I traced every `RETURNS TABLE` function across all 416 migration files. Every other redefinition either:
- Already has a `DROP FUNCTION IF EXISTS` before the change (e.g. `search_sellers_by_location`, `search_marketplace`, `search_nearby_sellers`, `confirm_upi_payment`, `create_multi_vendor_orders`)
- Keeps the same return column list (just changes the body)
- Uses a different argument signature (creates a separate overload, not a conflict)

## Safety
- These `DROP FUNCTION IF EXISTS` statements only affect local bootstrap (running all migrations from scratch)
- They have zero impact on your live production database, which already has the final function versions applied incrementally
- No application code changes needed

## After the fix
```powershell
supabase stop
supabase db reset   # or: supabase start
supabase status
```
All migrations will apply cleanly.

