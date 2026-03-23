

# 10 Buyer E2E Test Scenarios — Seed into test_scenarios

## Approach

Insert 10 realistic buyer-role test scenarios into the existing `test_scenarios` table. Each scenario uses the `run-test-scenario` edge function which authenticates as the test buyer/seller and executes Supabase SDK operations (insert, update, select, rpc, assert).

**Key constraint**: Test users and products don't exist yet. The edge function uses `seed-integration-test-users` credentials, so the scenarios must first set up test data (create seller profile, products) as admin/seller actor steps before buyer steps. Cleanup is automatic (the runner deletes inserted rows after each run).

## The 10 Test Scenarios

### 1. Happy Path: Add to Cart + COD Checkout
Seller creates product → Buyer browses (select products) → Buyer adds to cart → Buyer creates order via `create_multi_vendor_orders` RPC with `payment_method: cod` → Assert order status = `placed` → Seller accepts (update status to `accepted`) → Cleanup

### 2. Add to Cart + UPI Deep Link Checkout
Seller creates product → Buyer adds to cart → Buyer creates order with `payment_status: pending`, `payment_method: upi` → Assert status = `payment_pending` → Buyer calls `confirm_upi_payment` RPC with mock UTR → Assert status transitions to `placed` → Cleanup

### 3. Buyer Cancels Order After Placing
Seller creates product → Buyer places COD order → Assert `placed` → Buyer calls `buyer_cancel_order` RPC → Assert status = `cancelled` → Cleanup

### 4. Buyer Cancels Pending Payment Order
Seller creates product → Buyer places UPI order (payment_pending) → Buyer calls `buyer_cancel_pending_orders` RPC → Assert order cancelled → Cleanup

### 5. Multi-Item Cart (Same Seller)
Seller creates 3 products → Buyer adds all 3 to cart → Buyer creates order → Assert order exists with correct total → Verify `order_items` count = 3 → Cleanup

### 6. Cart Quantity Update + Remove Item
Seller creates 2 products → Buyer adds both → Buyer updates quantity of item 1 to 5 → Assert quantity = 5 → Buyer removes item 2 from cart → Assert cart has 1 item → Cleanup

### 7. Cart Clear (Empty Cart)
Seller creates product → Buyer adds to cart → Buyer deletes all cart_items → Assert cart is empty (select returns 0 rows) → Cleanup

### 8. Full Self-Pickup Lifecycle (Placed → Completed)
Seller creates product → Buyer places COD order → Seller updates status to `accepted` → Seller updates to `preparing` → Seller updates to `ready` → Buyer calls `buyer_advance_order` with `buyer_received` → Buyer calls `buyer_mark_order_completed` → Assert status = `completed` → Cleanup

### 9. Duplicate Cart Item Prevention (Quantity Merge)
Seller creates product → Buyer inserts cart_item (qty 1) → Buyer inserts same product again → Assert only 1 cart_item row exists (upsert/merge behavior) OR assert quantity increased → Cleanup

### 10. Cross-Society Product Visibility
Seller (society 1) creates product → Buyer (society 2) selects products with `is_available=true, approval_status=approved` → Assert product is visible (row_count >= 1) → Buyer adds to cart → Assert cart insert succeeds → Cleanup

## Step Format (matches existing runner)

Each step uses the existing `TestStep` interface:
```json
{
  "step_id": "unique_id",
  "label": "Human-readable description",
  "action": "insert|select|update|delete|rpc|assert",
  "table": "table_name",
  "actor": "buyer|seller|admin",
  "params": { ... },
  "expect": { "status": "success|error", "row_count": N, "field_checks": {} },
  "on_fail": "abort|continue|skip_remaining",
  "cleanup": true
}
```

## Implementation Steps

1. **Enhance `run-test-scenario` edge function** — Add a `setup` action type that uses the admin/service-role client to create seller profiles and products as test fixtures (current runner only supports authenticated actor clients, but setup data like seller_profiles needs service-role insertion). Also add step-result referencing so later steps can use IDs from earlier steps (e.g., use the product ID from step 1 in step 2's cart insert).

2. **Insert 10 scenarios** — Use the Supabase insert tool to seed all 10 scenarios into `test_scenarios` with fully defined step arrays.

3. **Redeploy edge function** — Deploy the enhanced runner.

## Technical Details

### Edge Function Enhancement Needed
The current runner cannot reference outputs from previous steps. For example, after inserting a product, the next step needs that product's `id` to add it to cart. 

**Solution**: Add a `context` map that stores step results by `step_id`. In step params, support `{{step_id.field}}` template variables that get resolved from context before execution.

Example:
```json
{ "step_id": "create_product", "action": "insert", "table": "products", "actor": "seller", "params": { "row": { "name": "Test Item", "price": 100, ... } } },
{ "step_id": "add_to_cart", "action": "insert", "table": "cart_items", "actor": "buyer", "params": { "row": { "product_id": "{{create_product.id}}", "quantity": 1 } } }
```

### Setup Steps Use Admin Actor
Product creation requires an approved seller_profile. The `admin` actor (service-role via the edge function) will handle fixture setup:
- Upsert seller_profile for the test seller
- Insert products with `approval_status: approved`, `is_available: true`

### Files to Modify/Create

| File | Change |
|------|--------|
| `supabase/functions/run-test-scenario/index.ts` | Add context/template resolution, `setup` action type |
| Database insert | 10 scenario rows into `test_scenarios` |

