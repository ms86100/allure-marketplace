

# Fix Cart State Reset & Duplicate Order Prevention

## Root Causes Found

### 1. Duplicate Orders: No DB-level idempotency
The `orders` table has an `idempotency_key` column with a unique index, but `create_multi_vendor_orders` **never sets it**. The client-side `useSubmitGuard` (3s cooldown) is easily bypassed by:
- Rapid taps after cooldown expires
- The pending-order guard checking `pendingOrderIdsRef` which is empty for COD orders (they clear immediately)
- COD flow: no session persistence, so the guard has nothing to check on re-entry

**Evidence:** 4 duplicate orders for same seller within 1 minute, all ₹10, all `pending/placed`, all with `idempotency_key = NULL`.

### 2. Cart not clearing after COD order
The COD flow calls `clearCart()` then immediately `navigate()`. The `clearCart` is async — it optimistically empties state, then does a DB delete. The `FloatingCartBar` checks `itemCount === 0` to hide. The race: if `reconcile()` inside `clearCart` hasn't completed before the navigation unmounts the cart page, the query cache may get stale data on the next mount. Also, `clearCart` doesn't call `clearPaymentSession()` (not needed for COD, but the cart count cache can desync).

### 3. Inconsistent behavior across attempts
After the first successful order, `clearCart` works optimistically. But if the user navigates back and the `reconcile` fetch returns stale data (Supabase query cache, replication lag), items reappear briefly.

---

## Plan

### Fix 1: DB-level idempotency in `create_multi_vendor_orders`
**New migration** — Add idempotency key parameter and duplicate check:

- Add `_idempotency_key text DEFAULT NULL` parameter
- At the start of the function, if `_idempotency_key IS NOT NULL`, check if orders with that key already exist. If so, return those order IDs immediately (no new orders created)
- Set `idempotency_key` on the first order in the group
- Client generates the key as `{userId}_{timestamp}_{cartHash}` before calling the RPC

### Fix 2: Client-side idempotency key generation
**File:** `src/hooks/useCartPage.ts`

- Generate a deterministic idempotency key from `user.id + sorted product IDs + quantities` before calling `createOrdersForAllSellers`
- Store it in a ref so retries use the same key
- Pass it to the RPC
- For COD: `await clearCart()` (await the promise) before navigating, ensuring DB delete completes
- After COD success, also invalidate cart queries explicitly

### Fix 3: Strengthen `useSubmitGuard` with in-flight lock
**File:** `src/hooks/useSubmitGuard.ts`

The current guard uses both a cooldown timer AND a `pendingRef`, but the issue is that for COD orders the function completes fast and the 3s cooldown is the only protection. Increase reliability:
- Add a `lockRef` that stays true until explicitly cleared (not just until the function returns)
- For the cart page: pass the lock ref so it can be held until navigation completes

### Fix 4: Force cart cache invalidation after order
**File:** `src/hooks/useCartPage.ts`

After `clearCart()`, explicitly set the query cache to empty array and count to 0, and invalidate:
```
queryClient.setQueryData(['cart-items', user.id], []);
queryClient.setQueryData(['cart-count', user.id], 0);
```

This ensures `FloatingCartBar` immediately sees `itemCount === 0` regardless of reconcile timing.

---

## Technical Details

**Migration SQL:**
```sql
CREATE OR REPLACE FUNCTION public.create_multi_vendor_orders(
  ... existing params ...,
  _idempotency_key text DEFAULT NULL
)
-- At top of function body:
IF _idempotency_key IS NOT NULL THEN
  SELECT array_agg(id) INTO _existing_ids
  FROM orders WHERE idempotency_key = _idempotency_key;
  IF _existing_ids IS NOT NULL THEN
    RETURN json_build_object('success', true, 'order_ids', to_json(_existing_ids), 'deduplicated', true);
  END IF;
END IF;
-- Set on first order insert: idempotency_key = _idempotency_key
```

**Client key generation (useCartPage.ts):**
```typescript
const cartHash = items.map(i => `${i.product_id}:${i.quantity}`).sort().join('|');
const idempotencyKey = `${user.id}_${Date.now()}_${hashCode(cartHash)}`;
```
Key is generated once per place-order attempt and stored in a ref.

**Files modified:**
- New migration SQL — add idempotency to `create_multi_vendor_orders`
- `src/hooks/useCartPage.ts` — generate + pass idempotency key, force cache clear after COD
- `src/hooks/useSubmitGuard.ts` — strengthen with longer lock for order flows
- `src/hooks/useCart.tsx` — ensure `clearCart` returns a promise that resolves only after DB delete

