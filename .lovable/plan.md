

# Fix: Razorpay Payment Never Confirms Order — Bulletproof Implementation

## Root Cause (Confirmed)

Order `a8549579` is stuck at `payment_pending` / `pending` with no `razorpay_payment_id`. The `payment_records` table has **zero rows** for this order.

**Bug 1**: The consolidated `create_multi_vendor_orders` RPC (migration `20260327144437`) dropped the `payment_records` INSERT entirely. No payment record is ever created for online orders.

**Bug 2**: The webhook's duplicate guard (`claimedRows.length === 0 → continue`) treats "no record found" identically to "already processed" — skipping the order update completely.

## Fix (3 parts)

### 1. Database Migration

**A. Restore payment_records INSERT in RPC**

After the order_items loop (line 338 of the RPC), add:

```sql
-- Insert payment record for online payments
IF _payment_method NOT IN ('cod') THEN
  INSERT INTO public.payment_records (
    order_id, buyer_id, seller_id, amount,
    payment_method, payment_status, platform_fee, net_amount,
    payment_collection, payment_mode, society_id
  )
  VALUES (
    _order_id, _buyer_id, _seller_id, _total,
    _payment_method, _payment_status, 0, _total,
    'direct', 'online', _society_id
  );
END IF;
```

**B. Add UNIQUE constraint on `razorpay_payment_id`** (hard idempotency — DB-level duplicate protection)

```sql
CREATE UNIQUE INDEX unique_razorpay_payment_id
  ON payment_records (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
```

Partial unique index — allows multiple NULLs (unpaid records) but prevents duplicate Razorpay IDs.

**C. Add UNIQUE constraint on `order_id`** (one payment record per order)

```sql
CREATE UNIQUE INDEX unique_order_payment_record
  ON payment_records (order_id);
```

**D. Data repair for order `a8549579`**

```sql
INSERT INTO payment_records (order_id, buyer_id, seller_id, amount, payment_method, payment_status, platform_fee, net_amount, payment_collection, payment_mode)
SELECT id, buyer_id, seller_id, total_amount, payment_type, payment_status, 0, total_amount, 'direct', 'online'
FROM orders WHERE id = 'a8549579-2db0-4e45-9bd9-520932f52cc5';
```

### 2. Webhook Rewrite: `supabase/functions/razorpay-webhook/index.ts`

Replace the claim-based guard in `payment.captured` with an idempotent upsert pattern:

```js
for (const orderId of allOrderIds) {
  // STEP 1: Idempotent upsert — handles missing records (legacy) + retries
  const { error: upsertError } = await supabase
    .from('payment_records')
    .upsert({
      order_id: orderId,
      razorpay_payment_id: razorpayPaymentId,
      payment_status: 'paid',
      payment_method: 'online',
      transaction_reference: razorpayPaymentId,
      payment_collection: 'direct',
      payment_mode: 'online',
    }, { onConflict: 'order_id', ignoreDuplicates: false });

  if (upsertError) {
    // If razorpay_payment_id unique constraint fires → true duplicate
    if (upsertError.code === '23505') {
      console.log(`Duplicate webhook for payment ${razorpayPaymentId}, skipping`);
      continue;
    }
    console.error(`Payment record upsert error for order ${orderId}:`, upsertError);
  }

  // STEP 2: State-guarded order update
  const { data: updatedOrder, error: orderError } = await supabase
    .from('orders')
    .update({
      status: 'placed',
      payment_status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
    })
    .eq('id', orderId)
    .in('status', ['payment_pending', 'placed'])
    .in('payment_status', ['pending'])
    .select('id, seller_id, buyer_id');

  // STEP 3: Notification ONLY if DB actually changed
  if (updatedOrder && updatedOrder.length > 0) {
    // ... existing seller notification logic (unchanged)
  }
}
```

Key improvements over current code:
- **Upsert on `order_id`**: works whether record exists or not
- **`23505` catch on `razorpay_payment_id`**: true duplicate detection at DB level
- **Double state guard**: `.in('status', [...])` AND `.in('payment_status', ['pending'])` prevents overwriting cancelled/advanced orders
- **Full upsert payload**: includes `payment_method`, `transaction_reference`, `payment_mode` — no partial state drift

### 3. Files Changed

| File | Change |
|------|--------|
| Database migration | Restore payment_records INSERT in RPC + 2 unique indexes + data repair |
| `supabase/functions/razorpay-webhook/index.ts` | Replace claim guard with idempotent upsert + state-guarded update |

### Why This Is Bulletproof

- **RPC fix**: every online order creates a payment_record at checkout
- **`UNIQUE(razorpay_payment_id)` index**: DB-level protection against Razorpay retries/duplicates
- **`UNIQUE(order_id)` index**: one payment record per order, no accidental duplicates
- **Upsert pattern**: handles both missing records (legacy) and normal flow
- **State guards**: order status can only advance forward, never regress
- **Notification tied to DB change**: fires exactly once per successful transition

