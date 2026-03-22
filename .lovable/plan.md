

## Fix: `confirm_upi_payment` RPC Rejects `payment_pending` Orders

### Root Cause

The `confirm_upi_payment` RPC (line 74) checks:
```sql
IF _order.status NOT IN ('placed', 'accepted') THEN
  RAISE EXCEPTION 'Order is not in a payable state';
END IF;
```

After the earlier P0 fix, UPI orders are created with `status = 'payment_pending'`. This status is not in the allowed list, so the RPC throws "Order is not in a payable state", which surfaces as "Failed to submit payment confirmation."

### Fix

**1. Database migration** — Update `confirm_upi_payment` RPC to allow `payment_pending` status:
- Change line 74 to: `IF _order.status NOT IN ('placed', 'accepted', 'payment_pending')`
- When confirming a `payment_pending` order, also transition status to `'placed'` (same as the Razorpay webhook does) so the seller gets notified

**2. Updated RPC logic:**
```sql
IF _order.status NOT IN ('placed', 'accepted', 'payment_pending') THEN
  RAISE EXCEPTION 'Order is not in a payable state';
END IF;

UPDATE public.orders
SET upi_transaction_ref = ...,
    payment_screenshot_url = ...,
    payment_status = 'buyer_confirmed',
    status = CASE WHEN _order.status = 'payment_pending' THEN 'placed' ELSE _order.status END,
    updated_at = now()
WHERE id = _order_id;
```

This ensures:
- UPI confirmation transitions `payment_pending` → `placed` (triggering seller notifications via realtime)
- Already-placed orders (COD UPI flow) keep their current status
- Seller notification in `UpiDeepLinkCheckout.tsx` still fires from the client side as a belt-and-suspenders approach

### Files
- **Database migration**: Update `confirm_upi_payment` function

### No client-side changes needed
The error is purely server-side. The existing client code in `UpiDeepLinkCheckout.tsx` is correct.

