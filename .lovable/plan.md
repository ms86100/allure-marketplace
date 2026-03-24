

# Fix: OTP RPC Skips to `delivered` Instead of Advancing One Step

## Root Cause

The `verify_delivery_otp_and_complete` RPC (lines 144-153) hardcodes the target status:

```sql
SELECT CASE
  WHEN EXISTS (... status_key = 'delivered' ...) THEN 'delivered'
  ELSE 'completed'
END INTO _target_order_status;
```

This means ANY delivery OTP verification jumps to `delivered`/`completed`, regardless of which step the OTP was configured on. When OTP is on `preparing` (sort 30), it skips `ready` (40), `picked_up` (50), `on_the_way` (60) and lands on `delivered` (70).

Additionally, the RPC validates the current status using `is_transit = true OR actor LIKE '%delivery%'` (lines 104-111), which is NOT workflow-driven — it should check if the current step's NEXT step requires delivery OTP.

## Fix: Make the RPC advance to the NEXT workflow step

### Database Migration — Update `verify_delivery_otp_and_complete`

Replace the hardcoded target status logic with workflow-driven next-step resolution:

```sql
-- Instead of hardcoding 'delivered'/'completed', find the next step in workflow
SELECT csf.status_key INTO _target_order_status
FROM category_status_flows csf
WHERE csf.transaction_type = _resolved_txn_type
  AND csf.parent_group IN (_parent_group, 'default')
  AND csf.sort_order > (
    SELECT sort_order FROM category_status_flows
    WHERE transaction_type = _resolved_txn_type
      AND parent_group IN (_parent_group, 'default')
      AND status_key = _order_record.status::text
    ORDER BY parent_group = _parent_group DESC
    LIMIT 1
  )
ORDER BY csf.sort_order ASC
LIMIT 1;
```

Also replace the `is_transit OR actor LIKE '%delivery%'` validation (lines 104-115) with a check that the NEXT step in the workflow has `otp_type = 'delivery'`:

```sql
-- Validate: the next workflow step must require delivery OTP
SELECT EXISTS (
  SELECT 1 FROM category_status_flows
  WHERE transaction_type = _resolved_txn_type
    AND parent_group IN (_parent_group, 'default')
    AND sort_order > current_sort_order
    AND otp_type = 'delivery'
  ORDER BY sort_order ASC
  LIMIT 1
) INTO _next_requires_otp;
```

This ensures:
- OTP on `preparing` → advances to `ready` (next step)
- OTP on `on_the_way` → advances to `delivered` (next step)
- No step is skipped
- Behavior is purely workflow-driven

### No frontend changes needed

The `DeliveryCompletionOtpDialog` already calls this RPC and refreshes. The dynamic button labels already work correctly. Only the backend RPC needs fixing.

## Files

| File | Change |
|---|---|
| DB migration | Update `verify_delivery_otp_and_complete` — workflow-driven next-step resolution instead of hardcoded `delivered`/`completed` |

