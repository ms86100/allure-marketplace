
## Availability Loop Fix Plan

### What’s actually broken
The loop is caused by a mismatch between two parts of the onboarding flow:

- `ServiceAvailabilityManager` saves `service_availability_schedules` immediately, but only generates `service_slots` when there are already approved products.
- `handleProceedToProducts` in `src/hooks/useSellerApplication.ts` blocks progression by checking for future rows in `service_slots`.

So for a new seller choosing a booking flow:
1. They save schedule successfully
2. They correctly see “add your first service to start generating slots”
3. But the next step still requires generated slots
4. Since no product exists yet, slots cannot exist
5. The flow loops

### Root cause in code
- `src/components/seller/ServiceAvailabilityManager.tsx`
  - treats saved schedules as valid setup
  - but only creates slots for approved products
- `src/hooks/useSellerApplication.ts`
  - validates against `service_slots`
  - not against `service_availability_schedules`
- `src/pages/BecomeSellerPage.tsx`
  - Step 3 says “Continue to Add Products” even when the blocker still expects slots first

## Fix approach

### 1. Change onboarding gate to check schedules, not slots
In `src/hooks/useSellerApplication.ts`:
- keep the action-type-driven check using `action_type_workflow_map.requires_availability`
- replace the current `service_slots` count query with a check for active `service_availability_schedules` for the seller
- allow progression to Step 4 when at least one schedule exists

Why:
- schedules are the seller’s actual setup action in onboarding
- slots are downstream generated data, not the right prerequisite before products exist

### 2. Keep slot generation behavior in `ServiceAvailabilityManager`
In `src/components/seller/ServiceAvailabilityManager.tsx`:
- do not reintroduce fake slot generation before products exist
- preserve current messages:
  - “add your first service...”
  - “slots will generate once your services are approved”
- optionally tighten wording so it’s explicit that schedule setup is complete and product creation is the next step

### 3. Align Step 3 UX with the real workflow
In `src/pages/BecomeSellerPage.tsx`:
- keep availability visible only when the selected action type requires it
- ensure the CTA after saving schedule genuinely moves forward once schedules exist
- add lightweight helper text under the availability section:
  - “First save your schedule, then add your bookable service”
This reduces confusion and matches the real sequence

### 4. Preserve system integrity
Do not change:
- DB trigger `validate_product_availability` logic
- action-type-driven `requires_availability` architecture
- product-level booking enforcement

The backend trigger should still ensure a booking product cannot be saved unless availability schedules exist.

## Files to update
- `src/hooks/useSellerApplication.ts`
  - replace `service_slots` gate with `service_availability_schedules` gate
- `src/components/seller/ServiceAvailabilityManager.tsx`
  - refine success copy only if needed
- `src/pages/BecomeSellerPage.tsx`
  - improve Step 3 helper/CTA clarity around schedule-first, product-next flow

## Expected result
After this fix:

- Book Now + no schedule → blocked
- Book Now + schedule saved + no products yet → allowed to continue to products
- Add first bookable product → allowed
- Actual slots still generate only when appropriate
- No more onboarding loop

## Safety checks
Test these flows end-to-end:

1. Booking category + `book`
- save schedule before adding products
- continue should go to Add Products without toast loop

2. Booking category + `book`
- no schedule saved
- continue should still block

3. Same category + `add_to_cart` / `contact_seller`
- should never require schedule

4. Existing seller with approved service products
- schedule save should still regenerate slot summary correctly

## Technical note
This is not a category-coupling bug anymore. It is a state-model mismatch:
- onboarding validation is checking generated slot data
- but onboarding setup only guarantees saved schedule data at that stage

The fix is to validate the seller’s completed prerequisite, not its later side effect.
