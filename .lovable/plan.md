

# Fix: `notification_queue` NOT NULL violation on order placement

## Root Cause

The trigger `trg_enqueue_order_notification_insert` fires AFTER INSERT on `orders` when `status IN ('placed', 'enquired')` and calls `fn_enqueue_order_status_notification()`.

This function inserts into `notification_queue` with **only** `type` and `payload` — it does NOT set `user_id`, `title`, or `body`, all of which are `NOT NULL` columns. This causes the insert to fail and the entire `create_multi_vendor_orders` transaction to roll back.

The other two INSERT triggers (`fn_enqueue_new_order_notification`, `enqueue_order_placed_notification`) correctly set `user_id`, `title`, and `body` — they are fine.

## Fix (single migration)

**Replace `fn_enqueue_order_status_notification`** so it properly populates `user_id`, `title`, and `body` when inserting into `notification_queue`. The function should:

- On INSERT: notify the **buyer** with a confirmation message (e.g., "Order placed successfully")
- On UPDATE (status change): notify the **buyer** about the status change (e.g., "Your order status changed to accepted")
- Derive `user_id` from `NEW.buyer_id` (which is always set)
- Build a human-readable `title` and `body` from the order status

```sql
CREATE OR REPLACE FUNCTION public.fn_enqueue_order_status_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _user_id uuid;
  _title text;
  _body text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _user_id := NEW.buyer_id;
    _title := 'Order Placed';
    _body := 'Your order has been placed successfully.';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    _user_id := NEW.buyer_id;
    _title := 'Order Update';
    _body := 'Your order status changed to ' || NEW.status::text;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_queue (user_id, title, body, type, payload)
  VALUES (
    _user_id, _title, _body, 'order_status',
    jsonb_build_object(
      'order_id', NEW.id,
      'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status::text ELSE NULL END,
      'new_status', NEW.status::text,
      'buyer_id', NEW.buyer_id,
      'seller_id', NEW.seller_id
    )
  );
  RETURN NEW;
END;
$$;
```

Zero frontend changes. Single SQL migration.

