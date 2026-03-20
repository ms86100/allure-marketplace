

## Financial-Grade Idempotency Fix

### Current State & Gaps

The current system has five weaknesses identified in your audit:

1. **No request-level guard** — idempotency is checked per-row (per seller), not per-request atomically
2. **Client resets key on ALL errors** (line 213) — network failures after DB commit cause duplicate orders on retry with a new key
3. **Race condition in loop** — two concurrent requests can each insert different seller rows before either hits a conflict
4. **Unique index is global** — `UNIQUE(idempotency_key)` instead of scoped to buyer
5. **No explicit locking** — parallel requests execute full logic concurrently

### Fix Design

**A. Database: Advisory lock + ON CONFLICT + canonical response**

Rewrite `create_multi_vendor_orders` with three layers of protection:

1. **Advisory lock first**: `pg_advisory_xact_lock(hashtext(_idempotency_key))` at the top of the function. This serializes all requests with the same key — only one executes at a time, eliminating the race condition entirely.

2. **Request-level check before loop**: Query orders matching the base key (existing logic), return immediately if found. This is the fast path for retries.

3. **`INSERT ... ON CONFLICT DO NOTHING` per seller**: Replace the `exception when unique_violation` block. After each insert, check `FOUND` — if false, the row already exists (concurrent edge case that slipped past the advisory lock release window).

4. **Canonical response at end**: After the loop, always `SELECT array_agg(id) FROM orders WHERE buyer_id = X AND idempotency_key LIKE base_key || ':%'` to return the full, consistent set regardless of which path created them.

5. **Replace unique index**: Drop `idx_orders_idempotency_key`, create `UNIQUE (buyer_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — scopes to buyer.

**B. Client: Never reset key until confirmed success**

In `src/hooks/useCartPage.ts`:

- **Generate key once** when user taps "Place Order" (line 195 — keep this)
- **On RPC error (line 211-214)**: Do NOT reset the key. Keep `idempotencyKeyRef.current` intact so retry uses the same key and hits the DB dedup path
- **On business errors** (store_closed, stock_validation, out_of_range): These are returned as `success: false` with no orders created, so reset is safe here (line 219 — keep this)
- **On confirmed success** (non-deduplicated): Reset key (line 226 — keep this)
- **On deduplicated success**: Keep key (already correct)

This means: key is only reset when we have definitive proof from the DB that either (a) orders were created fresh, or (b) no orders exist (business rejection).

**C. Quick-reorder edge function**

Already generates unique keys per call (`reorder_${order_id}_${Date.now()}`). No changes needed — each reorder invocation is intentionally a new request.

### Migration SQL (Pseudocode)

```sql
-- 1. Drop old global unique index
DROP INDEX IF EXISTS idx_orders_idempotency_key;

-- 2. Create buyer-scoped composite unique constraint  
CREATE UNIQUE INDEX idx_orders_buyer_idempotency 
  ON public.orders (buyer_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- 3. Recreate function with:
--    - pg_advisory_xact_lock(hashtext(_idempotency_key)) at top
--    - Request-level dedup check (existing logic, kept)
--    - INSERT ... ON CONFLICT (buyer_id, idempotency_key) DO NOTHING
--    - IF NOT FOUND → fetch existing order_id for that seller
--    - Final canonical SELECT to build response
```

### Client Change (useCartPage.ts)

```typescript
// Line 211-214: ONLY reset on confirmed no-orders-created errors
if (error) {
  // Do NOT reset idempotencyKeyRef — retry must use same key
  throw error;
}
```

### Files Changed

1. **Database migration** — New function + index swap
2. **`src/hooks/useCartPage.ts`** — Remove key reset on RPC error (line 213)

### Acceptance Criteria Met

- Same request always produces same result (advisory lock + dedup check)
- System recovers from any failure (key preserved, DB returns existing orders)
- No duplicate orders ever created (lock + ON CONFLICT)
- User never sees DB errors (all conflicts handled inside function)
- Multi-seller orders remain consistent (canonical SELECT at end)

