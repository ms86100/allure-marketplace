

## Fix: Order Placement Fails (CRITICAL) + Multi-Seller Notice

### Bug 1: Order placement always fails with "Something went wrong"

**Root cause:** The client sends 4 parameters (`_idempotency_key`, `_delivery_address_id`, `_delivery_lat`, `_delivery_lng`) to `create_multi_vendor_orders` that don't exist in the DB function signature. PostgREST returns a 404 because it can't find a matching function overload.

**Proof:** Console error: `PGRST202 ... Searched for the function public.create_multi_vendor_orders with parameters ... _idempotency_key ... but no matches were found`

**Fix:** Add the 4 missing parameters to the DB function via migration. The function will:
- Accept `_delivery_address_id UUID`, `_delivery_lat NUMERIC`, `_delivery_lng NUMERIC`, `_idempotency_key TEXT`
- Store `delivery_address_id`, `delivery_lat`, `delivery_lng` in the `orders` table insert
- Use `_idempotency_key` for duplicate order prevention (check if an order with this key was recently created)

### Bug 2: Multi-seller notice

The notice **does exist** at `CartPage.tsx` line 227: *"Your cart has items from X sellers. Separate orders will be created for each."* It renders when `sellerGroups.length > 1`. This should be visible with the current 2-seller cart. If it's not appearing, it may be scrolled off-screen. I'll verify it's not conditionally hidden, but no code change appears needed here.

### Implementation

1. **Database migration**: `ALTER FUNCTION` to add 4 new parameters with defaults, update the INSERT to include address_id/lat/lng, add idempotency guard
2. Verify the `orders` table has `delivery_address_id`, `delivery_lat`, `delivery_lng` columns (they may need to be added too)

### Technical Details

The migration will `DROP` and recreate the function with the expanded signature. All new params have defaults so existing callers won't break. The idempotency check will look for orders created by the same buyer in the last 30 seconds with matching idempotency key and return the existing order IDs instead of creating duplicates.

