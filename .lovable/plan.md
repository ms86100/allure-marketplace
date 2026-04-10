

# Backend-Only Fix Plan: Cart, Booking & Order Activity Failures

## Root Cause Analysis (Confirmed via Live DB Queries)

I queried the live Sociva database and found **5 concrete backend blockers** — all are missing or mismatched database objects. No frontend changes needed.

---

### Blocker 1: Cart failure — "chicken couldn't be added"

**Console error**: `function public.compute_store_status(time without time zone, time without time zone, text[], boolean) does not exist`

The `validate_cart_item_store_availability` trigger on `cart_items` calls `compute_store_status(availability_start, availability_end, operating_days, is_available)` — the 4-argument overload. But the **live DB only has a single-argument version**: `compute_store_status(_seller_id uuid) RETURNS text`. The 4-arg `(time, time, text[], boolean) RETURNS jsonb` overload from the Allure project was never successfully deployed to Sociva.

**Fix**: Create the missing 4-arg overload of `compute_store_status` matching the dump (lines ~821–866 of the dump).

---

### Blocker 2: Booking failure — "Failed to create booking"

**Root cause**: The `validate_order_fulfillment_type` trigger fires `BEFORE INSERT OR UPDATE` on `orders` and only allows: `self_pickup`, `delivery`, `seller_delivery`, `digital`. The booking flow inserts orders with `fulfillment_type = 'at_seller'` (or `home_visit`, `online`, `at_buyer`) — all rejected.

**Fix**: Update `validate_order_fulfillment_type()` to also accept `at_seller`, `at_buyer`, `home_visit`, and `online`.

---

### Blocker 3: Active order queries crash — "invalid input value for enum order_status: 'failed'"

**Console error**: `[LA-Sync] Failed to fetch active orders: invalid input value for enum order_status: "failed"`

The `order_status` enum is missing **2 values** present in the dump: `failed` and `buyer_received`. Frontend code (delivery dashboard, payment webhook, live activity sync) references `'failed'` in `.in('status', ...)` and `.not('status', 'in', ...)` filters, causing PostgREST to reject the query.

**Fix**: Add `failed` and `buyer_received` to the `order_status` enum.

---

### Blocker 4: Social proof RPC missing overload

**Console warning**: `Could not find the function public.get_society_order_stats(_lat, _lng, _product_ids, _radius_km)`

The live DB only has the old `get_society_order_stats(_society_id uuid)` signature. The frontend calls the geo-aware 5-arg overload `(_product_ids uuid[], _society_id uuid, _lat, _lng, _radius_km)`.

**Fix**: Create the missing multi-arg overload from the dump (lines ~3577–3616).

---

### Blocker 5: Checkout RPC signature mismatch

The live `create_multi_vendor_orders` has a different parameter order/set than what the frontend sends (`_coupon_code`, `_cart_total`, `_has_urgent`, `_preorder_seller_ids` etc. are missing from the live signature). This will cause checkout to fail.

**Fix**: Replace `create_multi_vendor_orders` with the dump's version (lines ~1619–1612 of the dump) which matches the frontend call signature exactly.

---

## Implementation Plan

A single database migration containing:

1. **`compute_store_status` 4-arg overload** — `CREATE OR REPLACE FUNCTION` with `(time, time, text[], boolean) RETURNS jsonb`
2. **`validate_order_fulfillment_type`** — `CREATE OR REPLACE FUNCTION` expanding the allowed list to include `at_seller`, `at_buyer`, `home_visit`, `online`
3. **`order_status` enum** — `ALTER TYPE ADD VALUE IF NOT EXISTS` for `failed` and `buyer_received`
4. **`get_society_order_stats` multi-arg overload** — `CREATE OR REPLACE FUNCTION` with `(_product_ids uuid[], _society_id uuid, _lat, _lng, _radius_km)`
5. **`create_multi_vendor_orders`** — `DROP` + `CREATE` with the correct signature matching the frontend

All changes are backend-only (SQL migration). Zero frontend files touched.

