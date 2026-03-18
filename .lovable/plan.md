

## Audit Result: "Ready → Completion" Flow — Remaining Gaps

### Status: NOT FULLY FIXED. One critical backend mismatch remains.

---

### What's Working

| Component | Status |
|-----------|--------|
| Frontend `resolveTransactionType` (both hooks) | Fixed — routes `delivery + seller` and `delivery + null` to `self_fulfillment` |
| `create_multi_vendor_orders` RPC | Fixed — correctly derives `delivery_handled_by` from seller's fulfillment_mode |
| Data backfill | Done — 0 orders remain with `delivery_handled_by = NULL` |
| Settlement trigger (`create_settlement_on_delivery`) | OK — fires on both `delivered` and `completed` |
| Self-fulfillment workflow transitions | OK — `ready → completed` allowed for seller and buyer |

### The One Remaining Gap (Critical)

**Two backend SQL functions** resolve `transaction_type` using only `fulfillment_type`, ignoring `delivery_handled_by`:

#### 1. `validate_order_status_transition()` (lines 80-84 of latest migration)
```sql
-- CURRENT (broken):
ELSIF NEW.fulfillment_type IN ('self_pickup', 'seller_delivery') THEN
  _txn_type := 'self_fulfillment';
ELSE
  _txn_type := 'cart_purchase';  -- ← delivery + seller lands HERE
```
Orders with `fulfillment_type='delivery'` + `delivery_handled_by='seller'` fall to `cart_purchase`. In that workflow, `ready → picked_up` requires `delivery` actor. Seller is blocked.

#### 2. `fn_enqueue_order_status_notification()` (lines 38-42)
Same logic — notifications look up the wrong workflow, so even if we fix validation, notifications would pull wrong templates.

### Exact Deadlock Scenario (Still Reproducible Today)

1. Seller has `fulfillment_mode = 'pickup_and_seller_delivery'`
2. Buyer places order with `fulfillment_type = 'delivery'`
3. `delivery_handled_by` correctly set to `'seller'`
4. Seller accepts → preparing → ready (all fine, these are seller-actor steps in both workflows)
5. Seller tries `ready → completed` (frontend shows this button via `self_fulfillment` flow)
6. Backend trigger fires `validate_order_status_transition`
7. Trigger resolves `fulfillment_type='delivery'` → `cart_purchase`
8. Checks `cart_purchase` transitions: `ready → completed` does NOT exist
9. **RAISES EXCEPTION: "Invalid status transition from ready to completed"**
10. Order stays stuck at `ready`

### All 5 Currently Stuck Orders

All have `fulfillment_type=delivery`, `delivery_handled_by=seller`, `status=ready`, `payment_status=pending`. They are blocked by this exact trigger mismatch.

### Fix Required

Update both SQL functions to add `delivery_handled_by` check before the fallback:

```sql
-- In BOTH validate_order_status_transition AND fn_enqueue_order_status_notification:

ELSIF NEW.fulfillment_type IN ('self_pickup', 'seller_delivery') THEN
  _txn_type := 'self_fulfillment';
ELSIF NEW.fulfillment_type = 'delivery' AND COALESCE(NEW.delivery_handled_by, 'seller') = 'seller' THEN
  _txn_type := 'self_fulfillment';
ELSE
  _txn_type := 'cart_purchase';
```

Using `COALESCE(NEW.delivery_handled_by, 'seller')` ensures any future NULL values also default safely (since platform delivery isn't live).

### Files Changed

| File | Change |
|------|--------|
| New SQL migration | Update `validate_order_status_transition()` — add `delivery_handled_by` check |
| Same migration | Update `fn_enqueue_order_status_notification()` — same fix |

No frontend changes needed — frontend logic is already correct.

### After This Fix

- Seller clicks "Mark Completed" on a delivery order they handle → backend validates as `self_fulfillment` → `ready → completed` allowed for `seller` actor → succeeds
- Settlement trigger fires on `completed` → creates payment settlement
- Notification trigger resolves correct workflow → sends proper notification
- COD payment status updated