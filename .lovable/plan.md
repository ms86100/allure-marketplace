

# Fix: `scheduled_date` Type Mismatch in RPC

## Problem
The just-created `create_multi_vendor_orders` function declares `_scheduled_date` and `_effective_scheduled_date` as `text`, but the `orders.scheduled_date` column is `date`. Postgres rejects the implicit cast.

## Fix
One migration that adds `::date` and `::time` casts on the INSERT values:

```sql
_effective_scheduled_date::date, _effective_scheduled_time::time
```

Line 272 of the latest migration — change from:
```
_effective_scheduled_date, _effective_scheduled_time
```
to:
```
_effective_scheduled_date::date, _effective_scheduled_time::time
```

This is done via a new migration that `CREATE OR REPLACE`s the function with the cast fix. No other changes needed.

| File | Change | Risk |
|------|--------|------|
| New migration SQL | Add `::date` / `::time` casts in INSERT | Zero — explicit cast of valid format strings |

