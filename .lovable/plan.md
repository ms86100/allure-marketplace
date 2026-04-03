

# Fix: Low Stock Alert Notifications for Sellers

## Root Cause

The `decrement_stock_on_order()` trigger (in migration `20260221151442`) decrements `stock_quantity` and auto-marks products unavailable at zero — but **never checks `low_stock_threshold`** and **never sends a notification**. There is no low-stock alert system anywhere in the codebase. The threshold field exists in the DB and UI, but is completely unused for notifications.

## Fix: Single Database Migration

Add a low-stock notification check to the existing `decrement_stock_on_order()` trigger function. After decrementing stock, if the new quantity crosses below the threshold, insert a notification into `notification_queue` for the seller.

### Migration SQL

Replace `decrement_stock_on_order()` to add:

```sql
CREATE OR REPLACE FUNCTION public.decrement_stock_on_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _product RECORD;
  _seller_user_id uuid;
BEGIN
  -- Decrement stock
  UPDATE products
  SET stock_quantity = GREATEST(stock_quantity - NEW.quantity, 0)
  WHERE id = NEW.product_id AND stock_quantity IS NOT NULL
  RETURNING id, name, stock_quantity, low_stock_threshold, seller_id
  INTO _product;

  IF _product IS NULL THEN RETURN NEW; END IF;

  -- Auto-mark unavailable at zero
  IF _product.stock_quantity <= 0 THEN
    UPDATE products SET is_available = false WHERE id = _product.id;
  END IF;

  -- Low stock alert: notify seller when stock crosses threshold
  IF _product.stock_quantity <= _product.low_stock_threshold THEN
    SELECT user_id INTO _seller_user_id
    FROM seller_profiles WHERE id = _product.seller_id;

    IF _seller_user_id IS NOT NULL THEN
      -- Prevent duplicate alerts: only notify if no recent
      -- low_stock notification for this product in last 24h
      IF NOT EXISTS (
        SELECT 1 FROM notification_queue
        WHERE user_id = _seller_user_id
          AND type = 'low_stock'
          AND (payload->>'product_id') = _product.id::text
          AND created_at > now() - interval '24 hours'
      ) THEN
        INSERT INTO notification_queue
          (user_id, type, title, body, reference_path, payload)
        VALUES (
          _seller_user_id,
          'low_stock',
          CASE WHEN _product.stock_quantity <= 0
            THEN '🚨 Out of Stock: ' || _product.name
            ELSE '⚠️ Low Stock: ' || _product.name
          END,
          CASE WHEN _product.stock_quantity <= 0
            THEN _product.name || ' is now out of stock and has been marked unavailable.'
            ELSE _product.name || ' has only ' || _product.stock_quantity || ' units left (threshold: ' || _product.low_stock_threshold || ').'
          END,
          '/seller/products',
          jsonb_build_object(
            'product_id', _product.id,
            'product_name', _product.name,
            'stock_quantity', _product.stock_quantity,
            'threshold', _product.low_stock_threshold
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

### Key Design Decisions

- **Deduplication**: Only one alert per product per 24 hours (prevents spam on multi-item orders)
- **Two-tier messaging**: Different title/body for "low stock" vs "out of stock"
- **Uses existing infrastructure**: Inserts into `notification_queue` → processed by existing `process-notification-queue` edge function → push notification delivered
- **No new tables or columns needed**

## Files Changed

| File | Change |
|------|--------|
| Migration | Replace `decrement_stock_on_order()` function to add low-stock notification logic |

## No Code Changes

The frontend already has the `low_stock_threshold` input in the seller product form. The notification queue processing pipeline already handles all notification types. This is purely a database trigger fix.

## Expected Result

1. Order placed → stock decremented
2. If new stock ≤ threshold → seller gets "⚠️ Low Stock" push notification
3. If stock hits 0 → seller gets "🚨 Out of Stock" notification + product auto-disabled
4. Same product won't trigger another alert for 24 hours

