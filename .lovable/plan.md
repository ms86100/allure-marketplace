

## Fix: ON CONFLICT error when editing draft products

### Root cause (verified)

The migration `20260422053307_*.sql` introduced `update_product_with_service()` which uses:

```sql
INSERT INTO public.service_listings (...) VALUES (...)
ON CONFLICT (product_id) DO UPDATE SET ...
```

But `service_listings` has **no unique constraint on `product_id`** — only the primary key on `id` and a non-unique index `idx_service_listings_product`. Postgres therefore raises:

> there is no unique or exclusion constraint matching the ON CONFLICT specification

This fires every time a seller edits a draft service product (or any service product), because the edit path always hits the upsert branch.

### Verified safe to fix

Query against current data shows **zero duplicate `product_id` rows** in `service_listings`, so promoting it to UNIQUE will not fail.

### The fix

**New migration** — add the missing unique constraint that the RPC's upsert relies on:

```sql
ALTER TABLE public.service_listings
ADD CONSTRAINT service_listings_product_id_key UNIQUE (product_id);
```

That's it. The RPC code is already correct; it just needs the constraint to exist.

### Why this is the right shape

- The business rule is "one service config per product" — a unique constraint encodes that invariant at the DB layer.
- Existing index `idx_service_listings_product` becomes redundant once the unique constraint creates its own backing index — drop it to avoid duplicate indexes:

```sql
DROP INDEX IF EXISTS public.idx_service_listings_product;
```

- No RLS / trigger / RPC changes needed. No app code changes needed.

### Verification

1. Edit any draft service product → save succeeds, no ON CONFLICT error.
2. Edit the same product twice in a row → second save updates the existing `service_listings` row (no duplicate inserted).
3. `SELECT product_id, COUNT(*) FROM service_listings GROUP BY 1 HAVING COUNT(*)>1` → empty.
4. Creating a new service product still works (insert path unaffected).

### Files touched

- One new migration adding the UNIQUE constraint and dropping the now-redundant index.

### Out of scope

- App / hook / form changes — the previous fix already validates fields and uses the RPC correctly.
- Other settings tables (`rental_settings`, `experience_settings`) — they don't exist in this project; only `service_listings` is involved.

