

# Fix: Add `at_gate` to `order_status` Enum

## Root Cause

The `order_status` enum in the database does **not** contain the value `'at_gate'`. The current enum values are:

```
placed, accepted, preparing, ready, picked_up, delivered, completed,
cancelled, enquired, quoted, scheduled, in_progress, returned,
on_the_way, arrived, assigned, requested, confirmed, rescheduled, no_show
```

The `delivery_assignments` table uses a **text** column for status, so `at_gate` works fine there. But multiple triggers and the `verify_delivery_otp_and_complete` RPC reference `at_gate` in the context of `orders.status`, which uses the `order_status` enum. When the delivery proximity system detects the seller is near the buyer's gate and sets the assignment status to `at_gate`, a sync trigger attempts to propagate this to `orders.status` — and the database rejects it because the enum value doesn't exist.

## Fix

Single database migration:

```sql
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'at_gate';
```

That is the entire fix. No code changes needed — all the triggers, RPCs, and frontend components already handle `at_gate` correctly. The enum is the only thing missing.

## Files Changed

| File | Change |
|------|--------|
| Database migration (new) | `ALTER TYPE order_status ADD VALUE 'at_gate'` |

