

## Plan: Multi-Actor Support for Workflow Actions — ✅ IMPLEMENTED

### Problem
The system only queried transitions for a single actor (`'seller'`), but workflows need multiple actors to perform the same action (e.g., seller acting as delivery agent in self-delivery).

### Changes Made

1. **`useCategoryStatusFlow.ts`** — Added `getNextStatusForActors()` helper that accepts an array of actors and returns the first valid next status across all of them. Backward compatible — `getNextStatusForActor` unchanged.

2. **`useOrderDetail.ts`** — `getNextStatus()` now passes `['seller', 'delivery']` when `delivery_handled_by !== 'platform'`, so sellers in self-delivery mode see delivery-actor transitions.

3. **`manage-delivery` edge function** — Transition validation changed from `.eq('allowed_actor', 'delivery')` to `.in('allowed_actor', ['delivery', 'seller'])`, so sellers can call delivery actions in self-delivery workflows.

4. **OTP dialog** — Already works for seller self-delivery via `isSellerView`. No change needed.
