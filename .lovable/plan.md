

# Fix All Remaining Migration Failures in One Pass

## Problem Summary

You have ~189 migration files remaining from `20260321090813` onwards. They keep failing one at a time because of:
1. **Missing tables** referenced before they're created (service_bookings, phone_otp_verifications, etc.)
2. **Duplicate policies/triggers/constraints** created without idempotency guards
3. **Function return type conflicts** from `CREATE OR REPLACE` on functions whose signature changed

I've audited every remaining migration file. Here are the **7 files** that need patching. Every other file should pass cleanly.

---

## Files That Need Full Replacement

### 1. `20260321090813_f4cf7f02-4650-4b2a-a144-7503fb9254e2.sql`
**Error**: `service_bookings` table does not exist
**Fix**: Prepend `CREATE TABLE IF NOT EXISTS` for all 7 missing service tables (service_listings, service_addons, service_staff, service_bookings, service_booking_addons, service_recurring_configs, session_feedback) with RLS, then wrap the trigger in `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`, and wrap the UPDATE in a DO block checking the table exists.

### 2. `20260321093401_83bd51e4-2bd7-42eb-963f-54eeff281f69.sql`
**Error**: `trg_decrement_stock_on_order_item` / `trg_restore_stock_on_order_cancel` triggers may already exist (from earlier migration `20260301082135`)
**Fix**: Add `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`.

### 3. `20260322105521_b1f9006c-1f9f-4e79-bde4-b334258c0c51.sql`
**Error**: `order_status_config_status_key_key` constraint already exists (table was created with `UNIQUE` on `status_key` in `20260215115217`)
**Fix**: Wrap in `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_config_status_key_key') ...`

### 4. `20260322112817_63314156-87bd-4dd3-b73d-3d208b5e3938.sql`
**Error**: Storage policies "Users can update own payment proofs" / "Users can delete own payment proofs" may already exist
**Fix**: Wrap each `CREATE POLICY` in a `DO` block with `pg_policies` existence check.

### 5. `20260323152138_654fc212-6c6b-461e-8fdf-08e950baf2fb.sql`
**Error**: Policies "admins_insert_flows", "admins_delete_flows", "admins_update_flows" on `category_status_flows` — bare `CREATE POLICY` will fail if they exist
**Fix**: Wrap all three in `DO` blocks with `pg_policies` existence checks, matching the pattern already used for the transitions table in the same file.

### 6. `20260324143906_69cf5139-63de-4151-9821-6f25a3efd67d.sql`
**Error**: `enforce_delivery_otp_gate` trigger referenced in `DROP TRIGGER IF EXISTS` is fine, but `order_otp_codes` table and `enforce_otp_gate` trigger use bare CREATE — could fail if re-run
**Fix**: Add `CREATE TABLE IF NOT EXISTS` wrapper and `DROP TRIGGER IF EXISTS enforce_otp_gate` before re-creation. Also add `ALTER PUBLICATION ... ADD TABLE` in a safe DO block.

### 7. `20260327152946_94ff4760-8c7a-43a8-afdf-dfaf111a3a57.sql`
**Error**: `trg_products_search_vector` trigger — bare `CREATE TRIGGER` will fail if it exists
**Fix**: Add `DROP TRIGGER IF EXISTS trg_products_search_vector ON public.products` before `CREATE TRIGGER`.

---

## What I'll Provide

Once you approve, I will give you the **complete replacement content** for each of these 7 files — full copy-paste ready. No partial patches, no instructions to "find and replace line X". Just 7 blocks of SQL, one per file.

## Steps After You Get the Files

1. Replace each file's content entirely
2. Run:
```powershell
supabase stop
supabase db reset
```
3. All 416 migrations should complete without errors

## Why This Should Be the Last Fix

Every other migration file in the remaining ~189 uses safe patterns (`CREATE OR REPLACE FUNCTION`, `ADD COLUMN IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). The 7 files above are the only ones with unsafe `CREATE TRIGGER`, `CREATE POLICY`, `CREATE TABLE`, or `ADD CONSTRAINT` without idempotency guards, or that reference tables that don't exist yet in the migration history.

