

# Fix: "Configure service settings" — auto-create missing service_listings

## Root Cause (confirmed via network logs)

The query `GET /service_listings?product_id=in.(c4c1cf17...,77551ad0...)` returns `[]` with status 200. No RLS issue — the rows simply don't exist. These products were likely created before `service_listings` upsert logic was added, or were created as non-service products.

The slot generator correctly reports "Configure service settings" because there genuinely are no `service_listings` rows to read duration/buffer/capacity from.

## Fix

When `generateServiceSlots` finds approved products with no `service_listings`, **auto-create default service_listings** for them instead of stopping. This matches what the reference project does implicitly (it always upserts service_listings during product save).

### Change 1: `src/lib/service-slot-generation.ts`

After fetching listings (line 98-106), if `listings` is empty or doesn't cover all approved products, auto-insert default `service_listings` rows for the missing ones:

```typescript
// After fetching listings, auto-create defaults for products missing them
const coveredProductIds = new Set((listings || []).map(l => l.product_id));
const missingProductIds = targetProductIds.filter(id => !coveredProductIds.has(id));

if (missingProductIds.length > 0) {
  const defaultListings = missingProductIds.map(pid => ({
    product_id: pid,
    duration_minutes: 60,
    buffer_minutes: 0,
    max_bookings_per_slot: 1,
    service_type: 'appointment',
    location_type: 'in_store',
    cancellation_notice_hours: 24,
    rescheduling_notice_hours: 12,
  }));

  await supabase.from('service_listings').upsert(defaultListings, { onConflict: 'product_id' });

  // Re-fetch to get all listings including newly created
  const { data: allListings } = await supabase
    .from('service_listings')
    .select('product_id, duration_minutes, buffer_minutes, max_bookings_per_slot')
    .in('product_id', targetProductIds);

  listings = allListings;
}
```

This ensures:
- Existing products that pre-date the service_listings feature get sensible defaults (60 min, 1 slot capacity)
- Slot generation proceeds without requiring the seller to re-edit every product
- The seller can later customize duration/buffer/capacity from the product form

### Change 2: Update feedback message

When defaults are auto-created, inform the seller:

```
"Hours saved — default service settings created for N product(s), M slots generated"
```

## Files changed

| File | Change |
|---|---|
| `src/lib/service-slot-generation.ts` | Auto-create default `service_listings` for approved products missing them |

## What this does NOT change
- Product form still lets sellers customize duration/buffer/capacity
- Store hours remain the single source of truth for schedules
- Buyer-side hook unchanged
- No DB migration needed — just inserting rows into existing table

