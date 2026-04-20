
## Diagnosis: DB is healthy. Real bug = code references a non-existent column

### Confirmed
- `select 1` against Supabase: **OK** (returns timestamp).
- `pg_is_in_recovery()`: **false** (writable).
- Auth logs: GoTrue restarted cleanly at 13:54 UTC, now serving normally.
- Supabase dashboard: all services Healthy (per your screenshot).

### New active error in postgres logs (every few seconds)
```
ERROR: column orders.order_number does not exist
ERROR: column orders_1.order_number does not exist
```

The `orders` table has **no `order_number` column** (verified against `information_schema`). The convention in this codebase is to derive a short id from the UUID: `upper(right(id::text, 6))` (used by the notification trigger in migration `20260410163722`).

Three files select this non-existent column and crash on every call:

| File | Impact |
|---|---|
| `supabase/functions/notification-engine/index.ts` (lines 60–62, 77–79, 121–125) | Cron runs every minute → query fails → **no notifications enqueued, ever**. This is also flooding postgres logs. |
| `src/hooks/useStuckOrders.ts` (line 44) | Admin "Stuck Orders" panel breaks. |
| `src/services/liveActivityMapper.ts` (line 140) | `order_short_id` derivation uses `order.order_number`, never available → typed any-cast hides the runtime issue. |

### Fix plan (code-only, no migration)

Use the existing convention `id.slice(0, 8).toUpperCase()` (matches the SQL trigger's `upper(right(id::text, 6))` style — close enough; admin panel already does this fallback).

**1. `supabase/functions/notification-engine/index.ts`**
- Remove `order_number` from the two `.select(...)` strings (lines 62 and the second orders query).
- Replace `(o as any).order_number ? String((o as any).order_number) : (o as any).id.slice(0, 8)` with simply `String(o.id).slice(0, 8).toUpperCase()`.
- Replace `order.order_number ? String(order.order_number) : order.id.slice(0, 8)` with `String(order.id).slice(0, 8).toUpperCase()`.

**2. `src/hooks/useStuckOrders.ts`**
- Remove `order_number` from the select list (line 44). Keep the rest as-is.

**3. `src/components/admin/StuckOrdersPanel.tsx`**
- Line 51: change `{o.order_number || o.id.slice(0, 8)}` → `{o.id.slice(0, 8).toUpperCase()}`.

**4. `src/services/liveActivityMapper.ts`**
- Line 140: pass only `order.id` to `deriveOrderShortId`, drop the `order.order_number` argument. If `deriveOrderShortId` requires the second arg, update its signature/callsite accordingly (will inspect during implementation).

### What I am NOT doing
- Not adding an `order_number` column. Nothing in the schema or other queries depends on one; introducing it now risks backfill complexity and a wider migration that the user did not ask for.
- Not touching auth, crons schedule, or splash logic — Supabase is healthy again, those discussions are moot.

### Verification after fix
- `supabase--analytics_query` on `postgres_logs` → no more `column orders.order_number does not exist` for 5+ minutes.
- `notification-engine` logs → returns `{ enqueued: N }` instead of throwing.
- `/admin` Stuck Orders panel renders rows with short ids.
- Live activity (live order tracking) shows the short id badge correctly.
