

# Implementation Plan: Search Geo-Filter + Notification Staleness & State Guards

## Overview

Two surgical fixes — no architectural changes. The system's realtime, state machine, and push infrastructure are already sound.

---

## Fix 1: Search Autocomplete — Add Location Filter to Seller Query

**File:** `src/components/search/SearchAutocomplete.tsx` (lines 78-97)

**Change:** Add bounding-box lat/lng filters and `is_available` check to the seller query. Update `queryKey` to include location params. Disable query when location is unavailable.

```typescript
queryKey: ['search-autocomplete-sellers', trimmed, lat, lng, radiusKm],
queryFn: async () => {
  if (!lat || !lng) return [];
  const boxDelta = radiusKm * 0.009;
  const { data } = await supabase
    .from('seller_profiles')
    .select('id, business_name, description, profile_image_url, categories')
    .eq('verification_status', 'approved')
    .eq('is_available', true)
    .ilike('business_name', `%${trimmed}%`)
    .gte('latitude', lat - boxDelta)
    .lte('latitude', lat + boxDelta)
    .gte('longitude', lng - boxDelta)
    .lte('longitude', lng + boxDelta)
    .limit(3);
  // ... same map
},
enabled: trimmed.length >= 2 && !!(lat && lng),
```

---

## Fix 2: Notification Queue — Add Staleness Guard + State Validation Guard

**File:** `supabase/functions/process-notification-queue/index.ts`

**Where:** After the dedup check (line 158), before the in-app insert (line 160). Add a new block that runs for order-related notification types.

**Three guards combined in one check:**

1. **Staleness guard** — if notification is >5 minutes old
2. **Terminal state guard** — if the order is already in a terminal state (`delivered`, `completed`, `cancelled`, `no_show`)
3. **State mismatch guard** (the user's mandatory addition) — if `item.payload.status` exists and differs from the current order status, the notification is outdated even if <5 minutes old

```typescript
// Guards: staleness + terminal + state-mismatch
const isOrderNotif = ['order_status', 'order', 'order_update'].includes(item.type);
if (isOrderNotif && item.payload?.orderId) {
  const ageMs = Date.now() - new Date(item.created_at).getTime();
  const isStale = ageMs > 5 * 60 * 1000;

  const { data: orderCheck } = await supabase
    .from('orders')
    .select('status')
    .eq('id', item.payload.orderId)
    .single();

  if (orderCheck) {
    const terminalStatuses = ['delivered', 'completed', 'cancelled', 'no_show'];
    const isTerminal = terminalStatuses.includes(orderCheck.status);
    const isStateMismatch = item.payload?.status && item.payload.status !== orderCheck.status;

    if ((isStale && isTerminal) || isStateMismatch) {
      // Save in-app as read, skip push
      await supabase.from('user_notifications').insert({
        user_id: item.user_id, title: item.title, body: item.body,
        type: item.type, reference_path: item.reference_path,
        queue_item_id: item.id, payload: item.payload, is_read: true,
      });
      await supabase.from('notification_queue')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', item.id);
      processed++;
      console.log(`[Queue][${item.id}] Skipped push: stale=${isStale}, terminal=${isTerminal}, mismatch=${isStateMismatch}`);
      continue;
    }
  }
}
```

**Why the state mismatch guard matters:** Even within 5 minutes, an order can rapidly transition (placed → preparing → delivered). Without this check, a "preparing" notification could arrive after the order is already "delivered" — confusing the user.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/search/SearchAutocomplete.tsx` | Add lat/lng bounding-box + `is_available` filter to seller query |
| `supabase/functions/process-notification-queue/index.ts` | Add staleness + terminal + state-mismatch guard before push delivery |

## Validation

- Search "Sanjay" from Shriram Greenfield → no stores >50km away
- Place order → no stale/contradictory notifications arrive
- Rapid state transitions → outdated pushes are suppressed
- Fresh, current-state notifications still deliver normally

