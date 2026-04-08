

# Backend Gap Analysis: Current Project vs Reference Project

## Architecture Differences Found

### 1. Slot Generation: Edge Function vs Client-Side (Critical)

**Reference project**: All slot generation happens **client-side** inside `ServiceAvailabilityManager.tsx` — no edge function exists.

**Current project**: Has both:
- `src/lib/service-slot-generation.ts` (client-side utility)
- `supabase/functions/generate-service-slots/index.ts` (edge function)

The edge function is **not used by the reference** and has been the source of repeated errors. The client-side utility duplicates the same logic but adds a fragile "auto-create service_listings" fallback that keeps failing.

**Fix**: Remove the `generate-service-slots` edge function entirely. Align `ServiceAvailabilityManager.tsx` with the reference implementation — inline the slot generation logic directly (no separate utility file needed), matching the reference's `handleSaveAndGenerate` pattern exactly.

### 2. Missing: Slot Summary Display

**Reference project** has a slot summary section in `ServiceAvailabilityManager` that shows:
- Total slots generated count
- Date range covered
- Per-day breakdown with day name, date number, and slot count
- Uses a `loadSlotSummary()` function querying `service_slots`

**Current project**: No slot summary at all. After saving, the seller has no visual confirmation of what slots exist.

**Fix**: Add `loadSlotSummary()` and the summary UI to `ServiceAvailabilityManager.tsx`, matching the reference.

### 3. Missing: Regenerate Button

**Reference**: Has a separate `RefreshCw` icon button next to "Save & Generate Slots" for quick regeneration.

**Current**: Only has a single "Save Hours" button.

**Fix**: Add the regenerate button and rename to "Save & Generate Slots".

### 4. Missing: `validate_product_availability` Trigger Alignment

**Current project** has this trigger (added in migration `20260403`). **Reference** does not have it in code but uses the same validation concept in the `useSellerApplication` hook.

This is fine — the current project has this correctly.

### 5. `service-slot-generation.ts` Utility — Should Be Removed

The reference project has NO separate utility file. All logic is inline in `ServiceAvailabilityManager.tsx`. The current utility adds:
- Auto-create `service_listings` fallback (fragile, keeps failing)
- Extra abstraction layer that makes debugging harder
- Multiple callers (`DraftProductManager`, `useSellerProducts`, `ServiceAvailabilityManager`) creating inconsistent behavior

**Fix**: Remove `src/lib/service-slot-generation.ts`. Move slot generation inline into `ServiceAvailabilityManager.tsx`. For `DraftProductManager` and `useSellerProducts`, keep their existing post-save slot generation but call it directly (matching reference pattern).

### 6. Edge Function Cleanup

The `generate-service-slots` edge function should be deleted since the reference project proves client-side generation works and is the intended architecture.

---

## Implementation Plan

### Step 1: Rewrite `ServiceAvailabilityManager.tsx`
Copy the reference project's implementation directly:
- Inline slot generation (no utility import)
- Add `loadSlotSummary()` with per-day breakdown
- Add `RefreshCw` regenerate button
- Rename button to "Save & Generate Slots"
- Add `date-fns` usage for `format` and `addDays`
- Remove `generateServiceSlots` import

### Step 2: Update `DraftProductManager.tsx` and `useSellerProducts.ts`
- Remove `import { generateServiceSlots }` 
- Inline the slot generation logic for post-product-save (matching reference pattern: query schedules, query listings, generate + upsert)
- Remove the "auto-create service_listings" fallback — product save should create service_listings via the product form itself

### Step 3: Delete `src/lib/service-slot-generation.ts`
No longer needed — logic is inline where it's used.

### Step 4: Delete `supabase/functions/generate-service-slots/`
The reference project does not use an edge function for this. Client-side generation with the authenticated Supabase client is the correct pattern.

### Step 5: Verify RLS policies are in place
The `service_listings` INSERT/UPDATE/DELETE policies from the previous fix must be applied. The `service_slots` table needs INSERT/UPDATE/DELETE for sellers (verify this exists).

---

## Files Changed

| File | Action |
|---|---|
| `src/components/seller/ServiceAvailabilityManager.tsx` | Rewrite to match reference |
| `src/components/seller/DraftProductManager.tsx` | Remove utility import, inline minimal slot gen |
| `src/hooks/useSellerProducts.ts` | Remove utility import, inline minimal slot gen |
| `src/lib/service-slot-generation.ts` | Delete |
| `supabase/functions/generate-service-slots/index.ts` | Delete |

## What stays the same
- `book_service_slot()` RPC — identical in both projects
- `send-booking-reminders` edge function — identical
- `ServiceBookingFlow.tsx` buyer-side flow
- `useServiceSlots.ts` buyer-side hook
- `UpcomingAppointmentBanner.tsx`
- `InlineAvailabilitySchedule.tsx`
- All other edge functions

