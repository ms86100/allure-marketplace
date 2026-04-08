
# Plan: Align slot generation with the working reference implementation

## What I found

The repeated failed attempts happened because the real failure was not seller auth, profile lookup, or slot-date logic.

It is this:

- The seller UI **does save store hours successfully**.
  - Network logs show:
    - `DELETE /service_availability_schedules` → `204`
    - `POST /service_availability_schedules` → `201`
- Immediately after that, the app calls `generate-service-slots`.
- The edge-function logs show the true error:
  - `permission denied for table service_availability_schedules`
- But the function currently **swallows that read error** and returns:
  - `"No store hours configured. Set your Store Hours first."`

So the message is false. The hours are saved; the function just cannot read them.

## What the referenced project does differently

In `@project:d5ca2adc-cab2-4db4-ba43-65eca80aa4ab`, the working pattern is:

- `ServiceAvailabilityManager` saves schedules
- then it **generates slots directly in the frontend using the authenticated Supabase client**
- it does **not depend on an edge function** for this seller-triggered flow

That matters because the same user who can insert the schedules can also read them through the same RLS path. It avoids the current service-role permission problem entirely.

## Recommended implementation

### 1) Stop using the edge function for seller-triggered slot generation
Adopt the reference-project pattern for this specific flow.

Reason:
- it is already proven in your other project
- it matches the permissions model that is already working
- it removes the fragile dependency on service-role access in this external Supabase project

### 2) Extract a shared slot-generation utility in the app
Create one reusable client-side generator used by all seller flows.

Suggested responsibility:
- read store-level schedules from `service_availability_schedules` where `product_id is null`
- read approved products for the seller
- read `service_listings`
- generate dated slots for the next 14 days
- safely delete only future, unbooked, unreferenced slots
- upsert into `service_slots` on `(seller_id, product_id, slot_date, start_time)`

This should reuse the good parts of the current edge-function logic, but run through the authenticated client.

### 3) Update `ServiceAvailabilityManager` to use the shared generator
After saving store hours:
- call the shared generator directly
- show accurate seller messages:
  - no approved services
  - missing service configuration
  - all days closed
  - slots generated successfully

This restores the behavior that worked in the reference project, while keeping your newer centralized “Store Hours only” model.

### 4) Update product save flows to use the same shared generator
Current project still calls the edge function from:
- `src/components/seller/DraftProductManager.tsx`
- `src/hooks/useSellerProducts.ts`

These should call the same shared client-side generator instead.

Important:
- product forms should only manage service config
- they should **not** reintroduce product-level schedules
- slot source of truth remains **store hours only**

### 5) Keep buyer-side slot fetching as-is
`src/hooks/useServiceSlots.ts` already matches the dated-slot model:
- queries `service_slots`
- filters by `slot_date`
- filters blocked/full slots
- confirms product approval

No change needed there.

## Why this is the safest fix

```text
Current flow
Seller UI saves hours -> Edge function tries admin read -> permission denied -> fake "no hours" message

Reference-aligned flow
Seller UI saves hours -> same authenticated client reads hours -> slots generated -> buyer sees slots
```

This is why multiple attempts kept failing:
- the fixes kept changing auth/ownership logic inside the edge function
- but the true blocker was the function’s inability to read the table in this project

## Files to change

- `src/components/seller/ServiceAvailabilityManager.tsx`
  - remove edge-function dependency
  - call shared generator directly
  - improve seller feedback
- `src/components/seller/DraftProductManager.tsx`
  - replace edge-function invocation with shared generator
- `src/hooks/useSellerProducts.ts`
  - replace edge-function invocation with shared generator
- `src/lib/service-slot-generation.ts` or similar
  - new shared utility
- `supabase/functions/generate-service-slots/index.ts`
  - either deprecate for seller flows, or keep only for future admin/cron usage
  - at minimum, stop returning misleading “No store hours configured” when the real error is permission-related

## Guardrails

- Store hours remain the **only** slot schedule source
- Product form manages only:
  - duration
  - buffer
  - capacity
  - booking rules
- Use the current safer deletion rule:
  - never delete slots tied to active bookings
- Keep generation idempotent with upsert
- Preserve date-based slots for buyer discoverability

## Expected result

After this change:
- saving hours works in one attempt
- slot generation no longer depends on broken service-role access
- seller messaging becomes truthful
- buyer-side slots appear without changing the buyer hook
- the implementation matches the working pattern from your other project

## QA checklist

1. Seller saves store hours → success banner shows generated count
2. Approved service product gets future rows in `service_slots`
3. Buyer opens that product → slots appear for the next 14 days
4. Changing service duration/buffer regenerates future unbooked slots
5. Existing booked slots are preserved
6. No seller message ever says “No store hours configured” when the insert succeeded
