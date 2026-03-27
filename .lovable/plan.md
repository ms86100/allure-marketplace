

# Fix: Pre-Order Online Payment Failure + 12-Hour Time Format

## Problem 1: Pre-Order Online Payment Crashes

**Root cause:** There are **4 overloaded versions** of `create_multi_vendor_orders` in the database. When the client passes `_scheduled_date`, `_scheduled_time_start`, and `_preorder_seller_ids` (pre-order params), Postgres resolves to the **20-parameter overload** — which has two fatal bugs:

1. **References non-existent columns** `sp.manual_override` and `sp.manual_override_until` in the `compute_store_status` call — causing an immediate SQL error
2. **Missing critical logic** from the canonical version: stock validation, `transaction_type` column, `payment_records` insert, seller notifications

Non-pre-order orders work because they match the **14-parameter overload** which has correct column references.

**Fix:** A single migration that:
- Drops all 4 overloaded versions
- Creates one canonical function with all 20 parameters, using the correct `sp.operating_days, coalesce(sp.is_available, true)` columns, stock validation, `transaction_type`, `payment_records`, and seller notifications from the working 14-param version — plus `scheduled_date`/`scheduled_time_start` insert logic from the 20-param version

## Problem 2: Time Slots in 24-Hour Format

The `PreorderDatePicker` generates slots like `"14:00"`, `"14:30"` and displays them as-is. Users expect `"2:00 PM"`, `"2:30 PM"`.

**Fix:** In `PreorderDatePicker.tsx`:
- Add a `formatTime12h` helper that converts `"14:00"` → `"2:00 PM"`
- Display 12-hour labels in the time dropdown (keep 24-hour as the internal `value`)
- Update the confirmation text to show 12-hour format

## Files Changed

| File | Change | Risk |
|------|--------|------|
| New migration SQL | Drop 4 overloads, create 1 canonical RPC | **Medium** — single-function consolidation, must preserve all existing logic |
| `src/components/checkout/PreorderDatePicker.tsx` | 12-hour display format | Zero — display only, internal values unchanged |

## Implementation Order
1. Migration first (fixes the blocking payment bug)
2. Time format fix second (cosmetic)

