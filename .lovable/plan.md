

## Plan: Multi-Actor Support for Workflow Actions

### Problem
The system only queries transitions for a single actor (`'seller'` or `'buyer'`), but workflows need to support statuses where **multiple actors** can perform the same action (e.g., both `seller` and `delivery` can advance a `picked_up` step in self-delivery scenarios).

Currently, `useOrderDetail.ts` line 89 hardcodes `getNextStatusForActor(flow, order.status, 'seller', transitions)`. If a transition is defined for `allowed_actor: 'delivery'`, the seller sees "Awaiting next step" even though they should be able to act.

The **transitions table already supports multi-actor** — you just add a row per actor. The bugs are in the **frontend query layer** and the **edge function validation**.

### 5 Changes

**1. `useOrderDetail.ts` — Seller next-status resolves across multiple actors**
- Change `getNextStatus()` to try `'seller'` first, then fall back to `'delivery'` if the seller is handling delivery (`delivery_handled_by !== 'platform'`)
- This means: if the admin adds a transition for `allowed_actor: 'seller'` on `picked_up → on_the_way`, the seller gets it directly. If only `delivery` actor is defined, the seller still gets it in self-delivery mode.

**2. `useCategoryStatusFlow.ts` — New `getNextStatusForActors()` function**
- Add a new helper that accepts an **array of actors** and returns the first valid next status across all of them
- `getNextStatusForActor` remains unchanged (backward compatible)
- `useOrderDetail` calls `getNextStatusForActors(flow, status, ['seller', 'delivery'], transitions)` for self-delivery orders

**3. `manage-delivery` edge function — Accept seller as delivery actor**
- The transition validation on line 241 hardcodes `.eq('allowed_actor', 'delivery')`
- Change to `.in('allowed_actor', ['delivery', 'seller'])` so that when a seller calls `manage-delivery` in self-delivery mode, the transition passes validation

**4. `OrderDetailPage.tsx` — OTP dialog available for any actor performing delivery**
- Currently gated by `o.isSellerView` — this already works for seller self-delivery
- Add: when `stepRequiresOtp` is true and the user is the delivery actor (check `delivery_assignments.delivery_partner_id === user.id`), also show the OTP dialog
- This enables third-party delivery riders to verify OTP too

**5. `TransitionRulesEditor.tsx` — Already supports multi-actor (no change needed)**
- The admin UI already lets you toggle multiple actor badges per transition (e.g., both `seller` and `delivery` for `picked_up → on_the_way`)
- No code change needed — just confirming this works correctly

### Files Modified

| File | Change |
|---|---|
| `src/hooks/useCategoryStatusFlow.ts` | Add `getNextStatusForActors()` helper |
| `src/hooks/useOrderDetail.ts` | Use multi-actor resolution for seller next-status |
| `supabase/functions/manage-delivery/index.ts` | Accept seller as valid delivery actor |
| `src/pages/OrderDetailPage.tsx` | Show OTP dialog for any authorized delivery actor |

### Risk Assessment

- **Low risk**: `getNextStatusForActors` is additive — existing single-actor calls unchanged
- **Low risk**: Edge function change only widens validation, doesn't remove checks
- **Medium risk**: OTP dialog visibility change — must verify `delivery_assignments.delivery_partner_id` is correctly set for seller self-delivery. If not populated, the dialog won't show for riders. Need to verify the assignment creation logic.

