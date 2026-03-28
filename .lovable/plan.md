

# Investigation Report: Order #71ab515b — Payment Confirmed But Stuck + Seller Gets Cancel

## Root Cause Chain (3 cascading failures)

### Bug 1: Wrong RPC overload was patched

There are **3 overloads** of `create_multi_vendor_orders` in the database:

```text
OID 45062 — 11 params (_payment_mode)        ← unused
OID 45102 — 20 params (_payment_method)       ← THE ONE THE CLIENT CALLS
OID 45718 — 13 params (_payment_mode)         ← the one our migration created/fixed
```

The previous migration added the `payment_records` INSERT to a **new 13-param overload** (OID 45718). But the client (`useCartPage.ts` line 327) calls with 20 parameters including `_payment_method`, `_delivery_address`, `_notes`, etc. — matching OID 45102. That overload has **zero payment_records logic**. So no payment record is ever created.

### Bug 2: Webhook upsert missing NOT NULL fields

The webhook does:
```js
.upsert({ order_id, razorpay_payment_id, payment_status: 'paid', ... })
```
But `payment_records.buyer_id` (NOT NULL) and `payment_records.amount` (NOT NULL) are not provided. When no existing record exists to update, the INSERT part fails silently with a NOT NULL violation. The order stays `payment_pending`.

### Bug 3: Auto-cancel kills the order

The order has `auto_cancel_at` set to 3 minutes (from the active RPC, line 180). The `auto-cancel-orders` edge function finds it past expiry with `payment_status != 'paid'` → cancels it → DB trigger fires `enqueue_order_status_notification` → seller gets "❌ Order Cancelled" notification.

**Full chain**: No payment_record → webhook can't upsert → order stays payment_pending → auto-cancel fires → seller notified of cancellation.

## Fix (3 changes)

### 1. Database Migration: Add payment_records INSERT to the CORRECT overload + drop broken ones

**A.** Replace the active 20-param overload to add payment_records INSERT after order_items loop:

```sql
-- After the order_items insert loop (line ~287 of the active function):
IF _payment_method NOT IN ('cod') AND _payment_status = 'pending' THEN
  INSERT INTO public.payment_records (
    order_id, buyer_id, seller_id, amount,
    payment_method, payment_status, platform_fee, net_amount,
    payment_collection, payment_mode, society_id
  ) VALUES (
    _order_id, _buyer_id, _seller_id, _total,
    'online', 'pending', 0, _total,
    'direct', 'online', _society_id
  );
END IF;
```

**B.** Drop the two unused/broken overloads (OID 45062 and 45718) to prevent future confusion.

**C.** Data repair: insert missing payment_record for order `71ab515b` and update its status if it hasn't been auto-cancelled yet.

### 2. Webhook fix: Fetch order data before upsert

The webhook must look up `buyer_id`, `seller_id`, and `total_amount` from the orders table before upserting into payment_records, so the INSERT path has all required NOT NULL fields:

```js
// Before upsert, fetch order details
const { data: orderData } = await supabase
  .from('orders')
  .select('buyer_id, seller_id, total_amount')
  .eq('id', orderId)
  .single();

if (!orderData) { console.error('Order not found'); continue; }

const { error: upsertError } = await supabase
  .from('payment_records')
  .upsert({
    order_id: orderId,
    buyer_id: orderData.buyer_id,
    seller_id: orderData.seller_id,
    amount: orderData.total_amount,
    net_amount: orderData.total_amount,
    razorpay_payment_id: razorpayPaymentId,
    payment_status: 'paid',
    payment_method: 'online',
    transaction_reference: razorpayPaymentId,
    payment_collection: 'direct',
    payment_mode: 'online',
  }, { onConflict: 'order_id', ignoreDuplicates: false });
```

### 3. Files changed

| File | Change |
|------|--------|
| Database migration | Replace 20-param RPC with payment_records INSERT + drop 2 broken overloads + data repair |
| `supabase/functions/razorpay-webhook/index.ts` | Fetch order data before upsert to satisfy NOT NULL constraints |

### Why this is now actually bulletproof

- **Correct overload**: the function the client calls now creates payment_records
- **Webhook resilience**: even if the RPC record is somehow missing, webhook can create one (all NOT NULL fields provided)
- **No orphan overloads**: dropping unused functions prevents future "wrong function" bugs
- **State guards**: existing `.in('payment_status', ['pending'])` on order update prevents regression

