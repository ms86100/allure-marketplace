

# Fix: Delivery Proximity Notification Spam (Race Condition)

## Problem

The screenshots show **4+ identical "Driver arriving now!" push notifications** firing simultaneously on the buyer's device. This is caused by a TOCTOU (Time-of-Check, Time-of-Use) race condition in the `update-delivery-location` edge function.

**How it happens**: The rider's device sends location updates every 2-3 seconds. Multiple concurrent edge function invocations all execute `SELECT count(*)` from `notification_queue` simultaneously, all see count = 0 (no recent notification), and all proceed to `INSERT` — producing duplicate notifications.

The existing dedup logic (lines 496-503 and 526-533 in the edge function) uses a time-window SELECT check which is inherently racy under concurrent writes.

## Fix (2 changes)

### 1. Database migration: Add partial unique index

Enforce deduplication at the database level so duplicates are physically impossible:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_proximity_notif_per_order
ON public.notification_queue (user_id, type, reference_path)
WHERE type IN ('delivery_proximity_imminent', 'delivery_proximity')
  AND is_read = false;
```

This guarantees only ONE unread proximity notification per user per order can exist, regardless of how many concurrent inserts race.

### 2. Edge function: Replace SELECT-then-INSERT with UPDATE-then-INSERT + conflict handling

In `supabase/functions/update-delivery-location/index.ts`, for both proximity tiers (imminent at line ~495 and nearby at line ~525):

**Before each insert**, mark any existing unread notification as read (opens the unique index slot):
```ts
await supabase
  .from('notification_queue')
  .update({ is_read: true })
  .eq('user_id', buyerId)
  .eq('type', 'delivery_proximity_imminent')
  .eq('reference_path', `/orders/${assignment.order_id}`)
  .eq('is_read', false);
```

**Replace the SELECT count check + INSERT** with a simple INSERT that silently handles duplicate key conflicts:
```ts
const { error: insertErr } = await supabase.from('notification_queue').insert({...});
if (insertErr && !insertErr.message?.includes('duplicate key')) {
  console.error('Proximity notification insert error:', insertErr);
}
```

Remove the `SELECT count` dedup checks entirely (lines 496-503 and 526-533) — the unique index now handles this atomically.

## Summary

| Change | File |
|---|---|
| Add partial unique index on `notification_queue` | Database migration (1 SQL statement) |
| Replace racy SELECT+INSERT with UPDATE+INSERT + conflict handling | `supabase/functions/update-delivery-location/index.ts` (~20 lines changed in 2 places) |

This eliminates the race condition at the database level, making duplicate proximity notifications impossible regardless of concurrent location updates.

