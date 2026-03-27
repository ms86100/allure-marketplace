
Fix checkout RPC drift instead of patching the next visible error.

What I found
- `order_items.product_name` is `NOT NULL` in the database.
- The current checkout RPC in `supabase/migrations/20260327135608_94f2ff1f-0781-4af9-b0c8-21aada2cd4f5.sql` inserts into `order_items` with only:
  - `order_id`
  - `product_id`
  - `quantity`
  - `unit_price`
  and does not write `product_name`.
- There are still 2 live `create_multi_vendor_orders` RPC signatures in the database:
  1. the newer 20-parameter checkout version
  2. an older `uuid, uuid, json, ...` overload
- The older overload also inserts `order_items` without `product_name`.
- This is why you keep seeing “a different error every time”: the flow has been patched in pieces, but the DB contract is still fragmented across multiple RPC versions.

Root cause
- The order creation path was optimized for performance, but the `order_items` insert no longer matches the table schema.
- On top of that, multiple active RPC overloads mean one fix can miss another live path.

Bulletproof implementation plan

1. Rebuild `create_multi_vendor_orders` as one authoritative DB contract
- Keep one real implementation only.
- Make every active signature delegate to the same internal logic or drop obsolete overloads safely.
- Stop having multiple independently maintained order-creation bodies.

2. Fix `order_items` snapshot writes at the source
- During validation, fetch authoritative product snapshot fields from `products`:
  - `name`
  - `price`
  - `seller_id`
  - availability/approval/stock fields
- Store `product_name` from database product data, not client payload.
- Also use server price consistently for `unit_price`.
- This removes both the null error and client-tampering risk.

3. Eliminate overload drift completely
- Audit all frontend and function callers of `create_multi_vendor_orders`.
- Standardize them on the canonical signature.
- For backward compatibility, keep temporary wrappers only if another live path still depends on the old signature.
- If wrappers remain, they must forward into the same shared implementation, not duplicate logic.

4. Normalize all fragile typed inputs in one place
- Centralize casting for:
  - `scheduled_date`
  - `scheduled_time_start`
  - payment/status fields
- Use safe `NULLIF(..., '')::date` / `::time` handling only in the canonical implementation.
- This prevents the recurring “text vs date/time” regressions from resurfacing in another overload.

5. Add hard failure messages that map to real business cases
- Return structured errors for:
  - unavailable item
  - price changed
  - insufficient stock
  - seller mismatch
  - store closed
  - delivery out of range
  - invalid scheduling payload
  - invalid product snapshot
- The client should only translate these; it should not re-implement checkout truth.

6. Add a schema-alignment safety pass for checkout inserts
- Verify every insert into:
  - `orders`
  - `order_items`
  - `payment_records`
  writes all required non-null columns explicitly or via defaults.
- This closes the current class of “one missing column after another” bugs.

Files / areas to change
- `supabase/migrations/...`
  - create one migration that:
    - fixes `product_name` insertion
    - consolidates or wraps both live RPC signatures
    - removes duplicated insert logic
- `src/hooks/useCartPage.ts`
  - verify only the canonical RPC is called
  - keep client thin and error handling mapped to structured backend errors
- Any other caller still using the old overload
  - update to canonical contract or temporary wrapper

Risk controls
- No schema guesswork: use the current live table contract as source of truth.
- No client trust for financial/order snapshots.
- No breaking old paths silently: compatibility wrapper first, removal second.
- No more piecemeal fixes: one migration must address both live signatures together.

Validation before closing
1. COD single-seller checkout creates orders successfully.
2. COD multi-seller checkout creates all orders successfully.
3. `order_items.product_name` is populated for every inserted row.
4. Online payment flow still creates pending orders correctly.
5. Pre-order scheduling still works with valid date/time.
6. Empty scheduling values do not crash inserts.
7. Stale caller path cannot hit the old broken insert anymore.
8. Duplicate taps still deduplicate correctly.
9. Stock and price validation still block invalid orders.
10. No checkout path can create partial order rows.

Expected result
- This stops the current `product_name` failure.
- It also addresses the larger issue causing repeated new checkout errors: RPC drift and schema-contract mismatch.
- After this, checkout becomes one stable backend path instead of multiple half-fixed versions.
