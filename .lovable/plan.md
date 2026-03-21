

# Round 10: PGRST203 — Duplicate Function Overload Blocking All Checkouts

## The Problem

**Every single order placement is failing right now.** The `create_multi_vendor_orders` RPC returns HTTP 300 with `PGRST203` because there are two overloaded versions of the function in the database:

1. **OID 31115 (OLD):** `_delivery_lat numeric, _delivery_lng numeric` — stale leftover from a previous migration
2. **OID 33356 (NEW):** `_delivery_lat double precision, _delivery_lng double precision` — the current correct version

PostgREST cannot decide which to call because JavaScript's `13.0715417` matches both `numeric` and `double precision`. This is a **P0 blocker** — no buyer can place any order.

## Fix: Single Migration to Drop the Old Function

Drop the old overload (the one with `numeric` lat/lng and `_cart_total numeric` without a DEFAULT). The newer function (with `double precision` and proper defaults) stays.

### SQL Migration

```sql
DROP FUNCTION IF EXISTS public.create_multi_vendor_orders(
  uuid, json, text, text, text, text, numeric,
  text, text, numeric, boolean, numeric, text,
  uuid, numeric, numeric, text
);
```

This targets the OLD signature specifically by matching its parameter types (`numeric, numeric` for lat/lng). The NEW function (`double precision, double precision`) is untouched.

## Impact Analysis

| Component | Impact | Risk |
|-----------|--------|------|
| `src/hooks/useCartPage.ts` | Calls RPC — will work once ambiguity is resolved | **None** — no code change needed |
| `supabase/functions/quick-reorder/index.ts` | Calls same RPC — same fix applies | **None** — no code change needed |
| `src/integrations/supabase/types.ts` | Auto-generated, lists both overloads — will regenerate | **None** — cosmetic only |
| RLS policies / triggers | None reference this function | **None** |
| Other RPCs | None call this function | **None** |

## Why This Is Safe

- The two functions have **identical logic** (both 7.4-7.5KB, same structure). The old one is simply a stale copy with slightly different parameter types.
- The client always passes `double precision` values (JavaScript floats like `13.0715417`), which match the remaining function perfectly.
- The `quick-reorder` edge function passes `null` for lat/lng, which also resolves cleanly to a single function.
- No data migration needed. No client code changes. No edge function redeployment.

## Files Modified

| File | Change |
|------|--------|
| Database migration only | `DROP FUNCTION` for the old overload |

**Zero application code changes required.** This is purely a database cleanup.

## Verification

After the migration, the same checkout request that currently returns 300 will return 200 with the order creation result.

