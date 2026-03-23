

## Root Cause Analysis: `book_service_slot` PGRST203 Error

### The Problem

There are **two overloaded versions** of `book_service_slot` in the database:

```text
Version 1 (older):  (_slot_id, _buyer_id, _seller_id, _product_id, _order_id, ..., _notes)
                     → inserts with status = 'requested'

Version 2 (newer):  (_order_id, _slot_id, _buyer_id, _seller_id, _product_id, ...)
                     → inserts with status = 'confirmed'
```

Both accept the same **named parameters** (all UUID + text types). When PostgREST receives a call with named args like `_order_id, _slot_id, _buyer_id, ...`, it cannot disambiguate because both functions match — they have the same parameter names, just in different order. This is **PGRST203: ambiguous function overload**.

Additionally, the older version inserts with `status = 'requested'` which contradicts the auto-confirm workflow design.

### Why This Happened

A migration created Version 2 with `CREATE OR REPLACE`, but because the parameter list (order + count) differs from Version 1, Postgres treated it as a **new overload** rather than a replacement. The old function was never dropped.

---

## Bulletproof Fix Plan

### Step 1: Database Migration — Drop old, keep single canonical function

Single migration that:
1. `DROP FUNCTION` both overloads explicitly
2. `CREATE FUNCTION` one canonical version with:
   - Parameter order: `_order_id, _slot_id, _buyer_id, _seller_id, _product_id, _booking_date, _start_time, _end_time, _location_type, _buyer_address, _notes`
   - `_notes` as optional (`DEFAULT NULL`)
   - Status = `'confirmed'` (auto-confirm per workflow design)
   - All existing safety checks preserved (duplicate, overlap, past-date, capacity lock)

```sql
DROP FUNCTION IF EXISTS public.book_service_slot(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.book_service_slot(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.book_service_slot(
  _order_id uuid,
  _slot_id uuid,
  _buyer_id uuid,
  _seller_id uuid,
  _product_id uuid,
  _booking_date text,
  _start_time text,
  _end_time text,
  _location_type text DEFAULT 'at_seller',
  _buyer_address text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS json ...
-- Single function body with status = 'confirmed'
```

### Step 2: Frontend — No changes needed

The existing call in `ServiceBookingFlow.tsx` already passes named parameters matching the canonical signature. It doesn't pass `_notes`, which is fine since it defaults to NULL.

### Step 3: Test scenario fix

Update the test scenario generator's booking steps to use the same parameter set, ensuring no `_notes` is required.

---

### Technical Details

| Aspect | Detail |
|---|---|
| Error code | PGRST203 — PostgREST cannot resolve function overload |
| Root cause | Two functions with same name, same param names, different param order |
| Postgres behavior | `CREATE OR REPLACE` only replaces if signature matches exactly; different param order = new overload |
| Risk of fix | Zero — dropping both and recreating one is atomic in a transaction |
| Files changed | 1 migration SQL, 0 application code changes |

