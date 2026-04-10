

# Backend Fix: Order Status Transition Failures

## Root Cause (Confirmed)

**The `validate_order_status_transition` trigger** fires BEFORE UPDATE on `orders` and compares:

```sql
WHERE from_status = OLD.status AND to_status = NEW.status
```

`from_status`/`to_status` in `category_status_transitions` are `text` columns, but `OLD.status`/`NEW.status` are `order_status` **enum**. PostgreSQL cannot implicitly cast `text = order_status`, producing the error:
> `operator does not exist: text = order_status`

This blocks **all** seller status updates (accept, reject) and buyer cancellations.

**Why buyer sees "accepted" and "ready for pickup"**: The order in the database is still `placed` — the UI is showing workflow steps as a visual timeline, not actual status transitions. The real statuses never applied because the trigger blocks the UPDATE.

## Fix (single migration, zero frontend changes)

### 1. Fix `validate_order_status_transition` — add explicit `::text` casts

Replace the function so that enum-to-text comparisons work:

```sql
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _valid boolean;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM category_status_transitions
    WHERE from_status = OLD.status::text
      AND to_status = NEW.status::text
      AND transaction_type = COALESCE(
        (SELECT transaction_type FROM category_config
         WHERE category = (SELECT category FROM order_items
                           WHERE order_id = NEW.id LIMIT 1)),
        'cart_purchase')
  ) INTO _valid;

  IF NOT _valid THEN
    SELECT EXISTS (
      SELECT 1 FROM category_status_transitions
      WHERE from_status = OLD.status::text
        AND to_status = NEW.status::text
    ) INTO _valid;
  END IF;

  IF NOT _valid THEN
    RAISE EXCEPTION 'Invalid status transition from % to %',
      OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;
```

### 2. Fix `buyer_cancel_order` — fix type comparison

The line `_current_status != _expected_status::text` compares a `text` variable (populated via `SELECT o.status`) against `_expected_status::text` which should work, BUT `o.status` is an enum — when `SELECT ... INTO _current_status` runs, it implicitly casts to text. However, the function signature declares `_expected_status order_status` and comparing further down is fine. The real blocker for cancellation is the same `validate_order_status_transition` trigger above. Fix #1 resolves this.

### 3. Verify `category_status_transitions` has `placed → cancelled` for buyer

Already confirmed — transitions exist for `from_status='placed'`, `to_status='cancelled'`, `allowed_actor='buyer'` in both `cart_purchase` and `self_fulfillment` transaction types for `default` and `food_beverages` parent groups.

## Summary

| Issue | Cause | Fix |
|-------|-------|-----|
| Seller accept/reject fails | `text = order_status` in trigger | Cast to `::text` |
| Buyer cancel fails | Same trigger blocks the UPDATE | Same fix |
| Buyer sees wrong statuses | UI timeline display, order is actually `placed` | No fix needed (display only) |

**One SQL migration. Zero frontend changes.**

