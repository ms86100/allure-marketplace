

# Fix: Slots Not Visible to Buyers

## Root Cause

Two mismatches between the database schema and the code:

1. **The `service_slots` table has NO `slot_date` column** — it only has `day_of_week` (integer). The edge function inserts slots with `day_of_week` correctly, but the buyer-side hook (`useServiceSlots.ts`) queries by `slot_date` (which doesn't exist), so the query returns zero rows.

2. **The unique constraint** `(seller_id, product_id, slot_date, start_time)` referenced in the edge function's upsert doesn't exist either — only `(seller_id, product_id, day_of_week, start_time)` may or may not exist.

## Decision: Which slot model?

The `day_of_week` (recurring template) model cannot track per-date capacity — if someone books the 9:00 AM Monday slot on April 14, it also blocks April 21. **Date-based slots are required for proper booking.** The approved plan also specified date-based slots.

## Fix Plan

### Step 1: Database Migration — Add `slot_date` column + unique constraint

```sql
ALTER TABLE public.service_slots
  ADD COLUMN IF NOT EXISTS slot_date DATE;

-- Drop the old day-based constraint if it exists
ALTER TABLE public.service_slots
  DROP CONSTRAINT IF EXISTS uq_service_slots_seller_product_day_time;

-- Create the date-based unique constraint
ALTER TABLE public.service_slots
  ADD CONSTRAINT uq_service_slots_seller_product_date_time
  UNIQUE (seller_id, product_id, slot_date, start_time);
```

### Step 2: Update Edge Function to generate DATE-based slots

**File:** `supabase/functions/generate-service-slots/index.ts`

Current logic iterates `activeSchedules` and generates slots per `day_of_week`. Change to:
- Iterate 14 days from today
- For each day, check if `day_of_week` matches an active schedule
- Generate slots with actual `slot_date` (e.g., `2026-04-08`) instead of just `day_of_week`
- Upsert on conflict `(seller_id, product_id, slot_date, start_time)`
- Safe delete: only future unbooked dated slots

### Step 3: Buyer hook is already correct

`useServiceSlots.ts` already queries by `slot_date` range — once the column exists and has data, it will work as-is.

## Files Changed

| File | Change |
|---|---|
| DB Migration | Add `slot_date` column + unique constraint |
| `supabase/functions/generate-service-slots/index.ts` | Generate 14-day dated slots instead of `day_of_week` templates |

No frontend changes needed — `useServiceSlots.ts` is already correct for date-based slots.

