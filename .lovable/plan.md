

# Server-Side Coupon Validation in `create_multi_vendor_orders`

## The Problem

The RPC blindly trusts `_coupon_discount` from the client. A malicious user could:
1. Pass `_coupon_discount: 999999` with a valid coupon ID to get a free order
2. Pass a coupon ID from a different seller
3. Pass an expired/inactive coupon
4. Bypass per-user usage limits

## The Fix

Add server-side coupon validation inside the RPC **before** applying the discount. The RPC already receives `_coupon_id`, `_cart_total`, and `_seller_groups` — enough to fully validate and recalculate.

### Database Migration: Modify `create_multi_vendor_orders`

After `_resolved_coupon_id` is set (line 87 in current RPC), add a validation block:

```sql
-- Server-side coupon validation
IF _resolved_coupon_id IS NOT NULL THEN
  DECLARE
    _coupon RECORD;
    _user_redemption_count int;
    _server_discount numeric;
  BEGIN
    -- Fetch coupon
    SELECT * INTO _coupon FROM public.coupons WHERE id = _resolved_coupon_id;

    -- Validate: exists, active, not expired, not before start, usage limit
    IF _coupon.id IS NULL
       OR NOT _coupon.is_active
       OR (_coupon.expires_at IS NOT NULL AND _coupon.expires_at < now())
       OR _coupon.starts_at > now()
       OR (_coupon.usage_limit IS NOT NULL AND _coupon.times_used >= _coupon.usage_limit)
    THEN
      -- Silently ignore invalid coupon (don't block order)
      _resolved_coupon_id := NULL;
      _coupon_discount := 0;
    ELSE
      -- Validate seller ownership: coupon must belong to a seller in this order
      IF NOT EXISTS (
        SELECT 1 FROM json_array_elements(_seller_groups) sg
        WHERE (sg->>'seller_id')::uuid IN (
          SELECT c.seller_id FROM public.coupons c WHERE c.id = _resolved_coupon_id
        )
      ) THEN
        _resolved_coupon_id := NULL;
        _coupon_discount := 0;
      ELSE
        -- Check per-user limit
        SELECT count(*) INTO _user_redemption_count
        FROM public.coupon_redemptions
        WHERE coupon_id = _resolved_coupon_id AND user_id = _buyer_id;

        IF _user_redemption_count >= _coupon.per_user_limit THEN
          _resolved_coupon_id := NULL;
          _coupon_discount := 0;
        ELSIF _coupon.min_order_amount IS NOT NULL AND _cart_total < _coupon.min_order_amount THEN
          _resolved_coupon_id := NULL;
          _coupon_discount := 0;
        ELSE
          -- Recalculate discount server-side (ignore client value)
          IF _coupon.discount_type = 'percentage' THEN
            _server_discount := (_cart_total * LEAST(_coupon.discount_value, 100)) / 100;
            IF _coupon.max_discount_amount IS NOT NULL THEN
              _server_discount := LEAST(_server_discount, _coupon.max_discount_amount);
            END IF;
          ELSE
            _server_discount := LEAST(_coupon.discount_value, _cart_total);
          END IF;
          _coupon_discount := ROUND(_server_discount, 2);
        END IF;
      END IF;
    END IF;
  END;
END IF;
```

This block **overwrites** `_coupon_discount` with the server-calculated value, ignoring whatever the client sent. If any validation fails, the coupon is silently removed (order still proceeds, just without discount).

### What This Touches — Impact Analysis

| Component | Impact | Risk |
|-----------|--------|------|
| `useCartPage.ts` (client checkout) | **None** — still sends coupon data the same way. Server may return a slightly different discount if client had a stale calculation, but the order total stored in DB will be correct. | Zero |
| `CouponInput.tsx` | **None** — client-side validation remains as UX convenience. Server is now the authority. | Zero |
| `CartPage.tsx` (display) | **None** — shows client-calculated values during checkout. After order creation, order detail page reads from DB (server-validated amount). | Zero |
| `quick-reorder` edge function | **None** — passes `_coupon_id: ""` and `_coupon_discount: 0`. The `NULLIF('','')` resolves to NULL, skipping the entire validation block. | Zero |
| `coupon_redemptions` insert (line 254-256) | **Safe** — uses the same `_coupon_discount` variable which is now server-validated. | Zero |
| `payment_records` | **Safe** — amount comes from `_total` which incorporates `_order_discount` which comes from the validated `_coupon_discount`. | Zero |
| Razorpay webhook | **No impact** — webhook reads `amount` from Razorpay, not from coupon fields. | Zero |
| `process-settlements` | **No impact** — reads `total_amount` from orders table (already server-validated). | Zero |
| Idempotency logic | **Safe** — coupon validation happens before the order insert loop. Deduplication still works on `idempotency_key`. | Zero |

### Why "Silently Ignore" Instead of "Reject Order"

If we reject the entire order because the coupon expired between page load and checkout, the buyer loses their cart flow. Instead, we proceed without the discount. The client already shows the discount — a minor UX mismatch — but the buyer gets their order and the seller doesn't lose revenue. This is the standard e-commerce pattern (Amazon, Flipkart).

### No Client-Side Changes Needed

The client already sends all the right parameters. The server simply stops trusting `_coupon_discount` and recalculates it. The stored `discount_amount` in the `orders` table will always be the server-validated value.

