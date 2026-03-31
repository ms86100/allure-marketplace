

# 2 Critical Buyer-Side Bugs — Pre-Production Audit

## Bug 1: RPC Cart Clear Fails for Buyers Without a Society (NULL society_id)

### Root Cause Analysis

The `create_multi_vendor_orders` RPC (line 315 of deployed function) clears the buyer's cart after order creation:

```sql
DELETE FROM public.cart_items WHERE user_id = _buyer_id AND society_id = _society_id;
```

`_society_id` is derived from the buyer's profile (line 83-84):
```sql
SELECT p.society_id, p.name INTO _society_id, _buyer_name FROM public.profiles p WHERE p.id = _buyer_id;
```

For marketplace-only buyers (no society membership), `society_id` is NULL. In SQL, `NULL = NULL` evaluates to `UNKNOWN` (not `TRUE`), so the `WHERE` clause matches **zero rows**. The DELETE silently does nothing.

Currently, 100% of cart items in the database have `society_id = NULL` (verified via query). This means the RPC's cart clear has **never worked** for any buyer. The system appears functional only because the client-side `clearCartAndCache()` compensates with its own `DELETE FROM cart_items WHERE user_id = ...` (no society_id filter).

### Impact Assessment

- **Severity: High** — The RPC is supposed to be the authoritative, transactional cart clear. It runs inside the same DB transaction as order creation, ensuring atomicity. The client-side fallback is non-transactional and runs after navigation.
- **Data leak**: If the client-side clear fails (network drop during navigation, app crash, tab close), the buyer retains stale cart items. On their next visit, they see items they already ordered. If they check out again, the idempotency key will be different (includes `Date.now()`), creating **duplicate orders**.
- **Affected flows**: All checkout paths (COD, UPI, Razorpay). Every single order placed through the system.

### Reproduction Steps

1. Create a buyer account without society membership (marketplace user)
2. Add items to cart and place a COD order
3. Immediately after the RPC returns, before client-side clear executes, check `cart_items` table — the items are still there
4. Simulate a network failure during the client-side `clearCartAndCache()` call (e.g., go offline immediately after order confirmation)
5. Reload the app — the cart still shows the items from the completed order
6. Place another order — a duplicate order is created

### Reverse Engineering Analysis

**Modules affected by fix**:
- `create_multi_vendor_orders` RPC — the SQL statement changes
- No client-side code changes needed

**Potential risks**:
1. Using `IS NOT DISTINCT FROM` instead of `=` would also delete cart items where `society_id` is a non-NULL value matching `_society_id`. This is the correct behavior — it unifies both NULL and non-NULL paths.
2. If a buyer has cart items across multiple societies (edge case), this would correctly clear only the matching society's items. Using just `user_id` without `society_id` would over-delete. The fix preserves the intent while handling NULL.

### Implementation Plan

**Database migration** — fix the DELETE statement:

```sql
CREATE OR REPLACE FUNCTION public.create_multi_vendor_orders(...)
-- ... (keep entire function body identical except line 315)
-- Replace:
--   DELETE FROM public.cart_items WHERE user_id = _buyer_id AND society_id = _society_id;
-- With:
--   DELETE FROM public.cart_items WHERE user_id = _buyer_id AND society_id IS NOT DISTINCT FROM _society_id;
```

The `IS NOT DISTINCT FROM` operator treats `NULL = NULL` as `TRUE`, which is the correct semantic.

### Validation & Assurance

- **Pre-fix verification**: `SELECT count(*) FROM cart_items WHERE society_id IS NULL` — confirms affected rows exist
- **Post-fix test**: Place an order as a society-less buyer, verify `cart_items` is empty immediately after RPC returns (before client-side clear)
- **Regression test**: Place an order as a society member, verify their cart is cleared correctly (non-NULL society_id path still works)
- **Edge case**: Buyer with items in cart but no profile row — `_society_id` would be NULL, fix handles this

---

## Bug 2: Server-Side Store Status Check Ignores `operating_days` — Orders Bypass Day Restrictions

### Root Cause Analysis

The `create_multi_vendor_orders` RPC (line 150 of deployed function) validates seller availability:

```sql
SELECT sp.business_name,
       public.compute_store_status(sp.availability_start, sp.availability_end, sp.manual_override, sp.manual_override_until),
       ...
FROM public.seller_profiles sp WHERE sp.id = _seller_id;
```

This calls the 4-parameter overload of `compute_store_status(time, time, text, timestamptz)` which checks:
- Manual override (open/closed)
- Time window (availability_start to availability_end)

It does **NOT** check `operating_days`. There is a separate overload `compute_store_status(time, time, text[], boolean)` that DOES check `operating_days` — but the RPC calls the wrong one.

The client-side `addItem` function correctly checks `operating_days` via `computeStoreStatus()` in `store-availability.ts` (line 28-30). But this is a client-side-only guard. The server-side RPC, which is the authoritative validation gate, does not enforce it.

### Impact Assessment

- **Severity: High** — A seller who sets their store to operate only Mon-Fri can receive orders on Saturday/Sunday. The client blocks the "Add to Cart" button, but:
  1. Items already in cart from a previous session (added on Friday) can be checked out on Saturday
  2. The `addItem` check uses cached seller data that may be stale
  3. Direct API calls bypass the client entirely
- **Trust erosion**: The seller configured their schedule explicitly. Receiving orders on a day they marked as closed violates their operating expectations and may result in cancellations.
- **Affected flows**: All checkout paths. The RPC is the single point of order creation — if it doesn't enforce day restrictions, nothing does.

### Reproduction Steps

1. As a seller, set operating days to Mon-Fri only (uncheck Sat, Sun)
2. As a buyer, add items from this seller to cart on Friday
3. Wait until Saturday
4. Open the cart page — items are still there (cart doesn't auto-remove based on operating days)
5. Click "Place Order" — the RPC validates the seller, calls `compute_store_status` with time-only check, determines the store is "open" (within time window), and creates the order
6. The seller receives an order on their day off

### Reverse Engineering Analysis

**Modules affected by fix**:
- `create_multi_vendor_orders` RPC — change the `compute_store_status` call to include `operating_days` and `is_available`
- No client-side code changes needed

**Potential risks**:
1. The correct overload `compute_store_status(time, time, text[], boolean)` does NOT support `manual_override`. Switching to it loses manual override support in the RPC. **Mitigation**: Either (a) create a 6-parameter overload that accepts both `operating_days` AND `manual_override`, or (b) check manual override separately in the RPC before calling the day-aware overload.
2. Existing orders placed on non-operating days would not be retroactively affected — this is a forward-only fix.

### Implementation Plan

**Database migration** — update the RPC to call the day-aware overload:

```sql
-- In create_multi_vendor_orders, replace the compute_store_status call:
-- FROM:
--   public.compute_store_status(sp.availability_start, sp.availability_end, sp.manual_override, sp.manual_override_until)
-- TO: Two-step check — manual override first, then day+time check

-- Option A (recommended): Add manual override check inline, then use day-aware overload
SELECT sp.business_name,
       CASE
         WHEN sp.manual_override = 'open' AND (sp.manual_override_until IS NULL OR now() <= sp.manual_override_until)
           THEN '{"status":"open","next_open_at":null,"minutes_until_open":0}'::jsonb
         WHEN sp.manual_override = 'closed' AND (sp.manual_override_until IS NULL OR now() <= sp.manual_override_until)
           THEN '{"status":"paused","next_open_at":null,"minutes_until_open":null}'::jsonb
         ELSE public.compute_store_status(sp.availability_start, sp.availability_end, sp.operating_days, sp.is_available)
       END,
       sp.latitude, sp.longitude, sp.delivery_radius_km
  INTO _seller_name, _seller_status, _seller_lat, _seller_lng, _seller_radius
FROM public.seller_profiles sp WHERE sp.id = _seller_id;
```

This preserves manual override priority while adding operating_days enforcement.

### Validation & Assurance

- **Test 1**: Seller with operating_days = ['Mon','Tue','Wed','Thu','Fri']. Attempt checkout on Saturday → RPC should return `store_closed` error.
- **Test 2**: Same seller with `manual_override = 'open'` on Saturday → RPC should allow the order (override takes precedence).
- **Test 3**: Seller with no operating_days configured (NULL or empty array) → RPC should allow order on any day (backward compatible).
- **Test 4**: Seller with `is_available = false` → RPC should return `paused` status regardless of day/time.
- **Regression**: All existing checkout flows for sellers with normal configurations should continue working.

---

## Summary

| # | Bug | Location | Confidence | Severity | Effort |
|---|-----|----------|-----------|----------|--------|
| 1 | RPC cart clear fails for NULL society_id | `create_multi_vendor_orders` RPC line 315 | 100% | High — duplicate order risk | ~5 min |
| 2 | Server-side store check ignores operating_days | `create_multi_vendor_orders` RPC line 150 | 100% | High — orders on closed days | ~10 min |

Both fixes are database migrations only — no client-side code changes needed.

