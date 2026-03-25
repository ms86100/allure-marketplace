

# Fix: Delivery OTP Verification Fails Due to Flow Priority Bug in RPC

## Problem

The "Verify & On the Way" button opens the OTP dialog correctly, but when the OTP is submitted, the database function `verify_delivery_otp_and_complete` rejects it with: **"Next step 'on_the_way' does not require delivery OTP verification"**.

**Root Cause**: A query bug in the RPC function. There are two copies of the `on_the_way` step in `category_status_flows`:

| parent_group | status_key | otp_type |
|---|---|---|
| `food_beverages` | `on_the_way` | `delivery` ✓ |
| `default` | `on_the_way` | `null` ✗ |

The frontend correctly prioritizes the `food_beverages` row and shows the OTP button. But the RPC's "get next step" query (line 117-125 of the migration) uses `parent_group IN ('food_beverages', 'default')` **without** prioritizing by parent_group — so it may pick the `default` row (which has no OTP), causing the rejection.

The current-step lookup (line 104-111) correctly uses `ORDER BY (parent_group = _parent_group) DESC`, but the next-step lookup does not.

## Fix

**Database migration** — Update `verify_delivery_otp_and_complete` to add parent_group priority to the next-step query:

```sql
-- Current (broken):
SELECT csf.status_key, csf.otp_type, COALESCE(csf.is_terminal, false)
INTO _next_step_status, _next_step_otp_type, _next_step_is_terminal
FROM public.category_status_flows csf
WHERE csf.transaction_type = _resolved_txn_type
  AND csf.parent_group IN (_parent_group, 'default')
  AND csf.sort_order > _current_sort_order
ORDER BY csf.sort_order ASC
LIMIT 1;

-- Fixed:
SELECT csf.status_key, csf.otp_type, COALESCE(csf.is_terminal, false)
INTO _next_step_status, _next_step_otp_type, _next_step_is_terminal
FROM public.category_status_flows csf
WHERE csf.transaction_type = _resolved_txn_type
  AND csf.parent_group IN (_parent_group, 'default')
  AND csf.sort_order > _current_sort_order
ORDER BY csf.sort_order ASC, (csf.parent_group = _parent_group) DESC
LIMIT 1;
```

This ensures that when two rows share the same `sort_order` (one from `food_beverages`, one from `default`), the specific parent_group row wins — matching the frontend behavior.

**No frontend changes needed** — the UI logic is already correct.

## Impact

- Fixes the red error "does not require delivery OTP verification" on seller_delivery workflows
- Affects only the `verify_delivery_otp_and_complete` RPC function
- 1 database migration, 0 code file changes

