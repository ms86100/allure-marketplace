

# Centralized Slot Management — Production-Ready Plan

## Architecture

```text
┌──────────────────────┐     ┌──────────────────────┐
│   Seller Settings    │     │   Product Form       │
│   "Store Hours"      │     │   (Service Config)   │
│   (schedule only)    │     │   duration/buffer/cap │
│                      │     │                      │
│   On save: writes    │     │   On save: writes     │
│   schedules → then   │     │   service_listings →  │
│   calls Edge Fn      │     │   then calls Edge Fn  │
└──────────┬───────────┘     └──────────┬───────────┘
           │                            │
           └──────────┬─────────────────┘
                      ▼
         ┌────────────────────────┐
         │  Edge Function:        │
         │  generate-service-slots│
         │                        │
         │  • Reads schedules     │
         │  • Reads listings      │
         │  • Deletes unbooked    │
         │    future slots safely │
         │  • Upserts 14-day slots│
         │  • Returns count       │
         └────────────────────────┘
```

## Triggers — When Slots Regenerate

| Event | Triggers regen? | Scope |
|---|---|---|
| Product save (service fields changed) | Yes | That product only |
| Store hours changed | Yes | All seller's service products |
| Product created (service type) | Yes | That product only |
| Price/title change only | No | — |
| Capacity changed | Yes | That product only |

## Plan

### Step 1: Create Edge Function `generate-service-slots`

**New file:** `supabase/functions/generate-service-slots/index.ts`

Accepts JSON body:
```json
{ "seller_id": "uuid", "product_id": "uuid | null" }
```
- If `product_id` provided → regenerate for that product only
- If `product_id` is null → regenerate for ALL seller's service products

Logic:
1. Fetch seller's `service_availability_schedules` (store-level, where `product_id IS NULL`)
2. Fetch `service_listings` for target product(s)
3. For each product+listing, compute 14 days of slots from schedule
4. **Safe delete**: delete future slots WHERE `booked_count = 0` AND `id NOT IN (select slot_id from service_bookings where status not in ('cancelled','completed','no_show'))`
5. Upsert new slots on conflict `(seller_id, product_id, slot_date, start_time)` — idempotent
6. Return `{ generated: N, deleted: N }`

Auth: validate JWT in code, extract `seller_id` from token to prevent spoofing.

### Step 2: Refactor `ServiceAvailabilityManager` → Store Hours Only

**File:** `src/components/seller/ServiceAvailabilityManager.tsx`

- Remove all slot generation logic (lines 227-315), slot summary display (lines 437-460), and the "Save & Generate Slots" button
- Rename heading to "Store Hours"
- Button becomes "Save Hours"
- On save success: call the edge function with `{ seller_id, product_id: null }` to regenerate ALL service product slots
- Show toast: "Hours saved — slots regenerated for N products"

### Step 3: Auto-generate Slots on Product Save

**File:** `src/hooks/useSellerProducts.ts` (lines 339-347)

After the existing `service_listings` upsert succeeds, call the edge function:
```ts
await supabase.functions.invoke('generate-service-slots', {
  body: { seller_id: sellerProfile.id, product_id: savedProductId }
});
```
Toast already shows "Product saved" — append slot info or keep silent.

**File:** `src/components/seller/DraftProductManager.tsx` (lines 271-309)

Same change: after `service_listings` upsert, call the edge function with `product_id`. Remove the `InlineAvailabilitySchedule` component and its availability schedule save logic (lines 288-309). The schedule is now store-level only.

### Step 4: Remove `InlineAvailabilitySchedule` from Product Form

**File:** `src/components/seller/DraftProductManager.tsx`
- Remove import of `InlineAvailabilitySchedule` and `INITIAL_AVAILABILITY_SCHEDULE`
- Remove `availabilitySchedule` state and its usage in draft save/restore
- Remove the `<InlineAvailabilitySchedule>` JSX (line 702-705)
- Remove the per-product `service_availability_schedules` upsert (lines 288-309)
- Remove the per-product schedule load in edit mode (lines 394-398)

### Step 5: Update `AvailabilityPromptBanner`

**File:** `src/components/seller/AvailabilityPromptBanner.tsx`

Change messaging from "set up availability" to "Set your Store Hours in Settings so booking slots can be generated for your services." The check remains the same (has service listings but no schedules).

### Step 6: Ensure DB Safety

**No new migration needed** — the unique constraint `(seller_id, product_id, slot_date, start_time)` already exists.

The edge function handles concurrency:
- Only deletes slots with `booked_count = 0` AND not referenced by active bookings
- Uses `upsert` with `onConflict` for idempotency
- Multiple rapid saves are safe — each call produces the same result

## Files Changed Summary

| File | Action |
|---|---|
| `supabase/functions/generate-service-slots/index.ts` | **New** — edge function |
| `src/components/seller/ServiceAvailabilityManager.tsx` | Strip slot logic, rename to Store Hours, call edge fn |
| `src/hooks/useSellerProducts.ts` | Call edge fn after service_listings upsert |
| `src/components/seller/DraftProductManager.tsx` | Remove InlineAvailabilitySchedule, call edge fn |
| `src/components/seller/AvailabilityPromptBanner.tsx` | Update messaging |

No DB schema changes required.

