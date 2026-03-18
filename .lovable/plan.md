

## Reduce Push Noise: Silent Push for Mid-Flow Statuses

### Approach

Add a `silent_push` boolean column to `category_status_flows`. The DB trigger already reads from this table — it will pass the flag through the notification payload. The `process-notification-queue` edge function will check this flag and skip calling `send-push-notification` for silent items (while still inserting into `user_notifications` for in-app history).

### Adjusted Matrix (per your feedback)

| Status | `silent_push` | Rationale |
|--------|--------------|-----------|
| `accepted` | false | Critical — order confirmed |
| `preparing` | **true** | Mid-flow, Live Activity handles it |
| `ready` | **false** | Pickup moment — keep push (your Condition 1) |
| `picked_up` | **true** | Mid-flow tracking |
| `on_the_way` | **true** | Mid-flow tracking |
| `arrived` | **true** | Live Activity shows this on lock screen |
| `delivered` | false | Critical endpoint |
| `completed` | false | Critical endpoint |
| `cancelled` | false | Critical — must alert |
| `no_show` | false | Critical |
| All service/booking statuses | false | No Live Activity for these |

Key decision: **`ready` stays as a full push** per your recommendation that it's a pickup-critical moment.

### Changes

**1. Database migration** — Add column + backfill:
```sql
ALTER TABLE category_status_flows 
  ADD COLUMN IF NOT EXISTS silent_push boolean DEFAULT false;

UPDATE category_status_flows 
  SET silent_push = true 
  WHERE status_key IN ('preparing', 'picked_up', 'on_the_way', 'arrived');
```

**2. DB trigger `fn_enqueue_order_status_notification`** — Include `silent_push` in the payload:
```sql
-- Add to v_payload when silent_push is true
v_payload := v_payload || jsonb_build_object('silent_push', v_silent_push);
```

**3. `process-notification-queue/index.ts`** — Skip push delivery for silent items:
```typescript
const silentPush = item.payload?.silent_push === true;

// Always insert in-app notification (unchanged)
// ...

if (silentPush) {
  // Mark processed without sending push — in-app record already saved
  await supabase.from("notification_queue")
    .update({ status: "processed", processed_at: new Date().toISOString() })
    .eq("id", item.id);
  processed++;
  continue;
}

// Existing push delivery logic continues for non-silent items
```

**4. No client-side changes** — The existing `isTracking` foreground suppression remains as a secondary safety net. Badge counts and in-app notification center continue to update for all notifications (silent or not) since `user_notifications` insert is unaffected.

### Safety Guarantees (Conditions Met)

- **Condition 1 (Don't over-silence)**: `ready` keeps full push. Only truly mid-flow statuses are silenced.
- **Condition 2 (Visibility fallback)**: In-app notification history + badge count always update regardless of `silent_push` flag. User can always check notification center.
- **Fallback answer**: If phone is in pocket and Live Activity is not visible, user will still see `ready` and `delivered` push banners — the two moments that matter most.

