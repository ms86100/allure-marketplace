

# Root Cause: "Failed to update order" on Accept

## The Bug

The `validate_order_status_transition` trigger references `p.transaction_type` from the `products` table. **That column does not exist on `products` — it exists on `category_config`.**

Every single order status update (accept, prepare, ready, etc.) hits this trigger, the SQL query fails with `column p.transaction_type does not exist`, and the entire UPDATE is rejected. The frontend catches this as "Failed to update order."

This is not conditional. It fails for ALL orders — self-delivery, buyer pickup, delivery partner, doesn't matter. The trigger crashes before it even gets to sort order or actor validation.

## The Fix

**One line change in the trigger:** replace `p.transaction_type` with `cc.transaction_type`.

Migration SQL:
```sql
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _category text;
  _txn_type text;
  _parent_group text;
  _current_sort int;
  _new_sort int;
  _new_actor text;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT p.category, cc.transaction_type, cc.parent_group
    INTO _category, _txn_type, _parent_group
    FROM public.products p
    JOIN public.category_config cc ON cc.category = p.category
    JOIN public.order_items oi ON oi.product_id = p.id
    WHERE oi.order_id = NEW.id
    LIMIT 1;

  SELECT sort_order INTO _current_sort
    FROM public.category_status_flows
    WHERE parent_group = _parent_group
      AND transaction_type = _txn_type
      AND status_key = OLD.status;

  SELECT sort_order, actor INTO _new_sort, _new_actor
    FROM public.category_status_flows
    WHERE parent_group = _parent_group
      AND transaction_type = _txn_type
      AND status_key = NEW.status;

  IF _current_sort IS NULL OR _new_sort IS NULL THEN
    RETURN NEW;
  END IF;

  IF _new_sort != _current_sort + 1 THEN
    RAISE EXCEPTION 'Invalid status transition from % to % (sort % -> %)',
      OLD.status, NEW.status, _current_sort, _new_sort;
  END IF;

  IF _new_actor IN ('delivery', 'system') THEN
    IF coalesce(current_setting('app.delivery_sync', true), '') != 'true'
       AND current_setting('role', true) != 'service_role' THEN
      RAISE EXCEPTION 'Status "%" can only be set by the delivery system, not directly', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

## Interim Behavior After Fix (No Delivery Partner)

Once fixed, the food flow is: `placed(1) → accepted(2) → preparing(3) → ready(4) → picked_up(5) → on_the_way(6) → delivered(7) → completed(8)`.

- **Seller accepting:** `placed→accepted` (sort 1→2, actor=seller) — **will work**.
- **Seller advancing to preparing, ready:** sort 2→3→4, all actor=seller — **will work**.
- **Seller advancing past ready:** `picked_up` has actor=`delivery`, so the UI's `getNextStatusForActor` returns `null` — seller sees no "next" button. The actor enforcement trigger also blocks direct API calls.

For self-delivery/buyer-pickup without a delivery partner, the seller is currently **stuck at `ready`**. There is no path to `completed` because `picked_up`, `on_the_way`, `delivered`, `completed` are all delivery/system actors.

**This is the second issue that needs resolution.** The flow seeded in `category_status_flows` assumes a delivery partner always exists. For self-delivery or buyer-pickup, the seller needs to be able to go `ready → completed` directly.

### Proposed approach for the interim state

Add a **self-fulfillment food flow** by adding rows to `category_status_flows` with a different transaction_type (e.g., `self_fulfillment`) that skips delivery steps:

```
placed(1, buyer) → accepted(2, seller) → preparing(3, seller) → ready(4, seller) → completed(5, seller)
```

Then the `useOrderDetail` hook resolves which transaction_type to use based on `fulfillment_type` on the order (self_pickup / seller_delivery → `self_fulfillment`; delivery_partner → `cart_purchase`).

This keeps the existing delivery flow intact while unblocking sellers who don't use platform delivery.

