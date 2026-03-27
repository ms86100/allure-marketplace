
# Bulletproof fix plan: make checkout fast by removing duplicate work, not by repainting the overlay

## What’s actually causing the delay
The current COD/shared checkout path does too much before navigation:

1. Client product validation query
2. Client seller-open / delivery-radius loops
3. Second client product price query inside `createOrdersForAllSellers`
4. RPC order creation

That means the buyer waits through multiple sequential checks before the app can move forward. The overlay is only showing that latency.

There is also one safety problem today: the overlay’s “Go Back” only hides the UI; it does not cancel the in-flight order creation request.

## Robust implementation plan

### 1. Make order creation RPC the single source of truth
**File:** new migration recreating `create_multi_vendor_orders`

Rework the RPC so it validates everything authoritatively in one place using live database values:

- product exists
- product is available
- product is approved
- product belongs to the seller group being submitted
- stock is sufficient
- seller is open
- delivery radius is valid
- current price matches the cart snapshot

Important hardening:
- do not trust client `unit_price` for financial correctness
- compute validation from database rows
- return structured error codes for:
  - `unavailable_items`
  - `price_changed`
  - `store_closed`
  - `delivery_out_of_range`
  - `insufficient_stock`
  - `seller_mismatch`

This removes duplicated client checks and closes the risk of stale or manipulated pricing.

### 2. Collapse checkout to one network-critical step for COD
**File:** `src/hooks/useCartPage.ts`

Refactor `handlePlaceOrderInner` and `createOrdersForAllSellers` so the client only does:

- fast local synchronous guards
- pending-payment guard if needed
- one RPC call to create the order(s)

Remove from the client:
- availability query
- price freshness query
- seller open-state loop
- delivery distance loop

Those become server-owned and atomic.

Result:
```text
Before:
client query -> client loop -> client query -> RPC -> navigate

After:
local guards -> RPC -> navigate
```

### 3. Make COD feel instant
**Files:** `src/hooks/useCartPage.ts`, `src/pages/CartPage.tsx`

For COD:
- stop showing the full-screen progress overlay
- keep the “Place Order” button in loading state
- navigate immediately after the RPC succeeds
- keep cart clear, notification trigger, push-permission request, and prefetch work in the background exactly as now

This matches the existing instant-checkout architecture and removes the unnecessary blocking screen for successful COD orders.

### 4. Keep a progress UI only where it is actually needed
**Files:** `src/pages/CartPage.tsx`, `src/components/checkout/OrderProgressOverlay.tsx`

For online payments only:
- keep progress feedback during order creation / payment handoff
- add a delayed show threshold so fast requests do not flash the overlay unnecessarily
- remove the fake cancel/back behavior while a request is active

If a request cannot be aborted, the UI must not pretend it was cancelled.

### 5. Preserve current payment behavior, but make it safer
**Files:** `src/hooks/useCartPage.ts`, payment components only if needed

Do not change the successful downstream flows:
- Razorpay session restore
- UPI pending payment restore
- background cart clearing after confirmed success
- pending-payment lifecycle protections

Only change the order-creation entry point so online flows also benefit from the faster single-RPC validation path.

## Risk controls
This plan is designed to eliminate both latency and re-report risk:

- **No pricing regression:** server validates live price before order creation
- **No stale availability regression:** server validates availability/approval in the same transaction
- **No seller spoofing risk:** server verifies each product belongs to the submitted seller
- **No false cancel UX:** remove overlay “Go Back” for active requests
- **No duplicate order risk:** existing idempotency stays in place
- **No payment flow regression:** payment sheets and pending-payment recovery stay intact

## Validation checklist
I would verify all of these before closing the fix:

1. COD single-seller order navigates immediately after tap
2. COD multi-seller order navigates immediately after tap
3. Razorpay flow still creates pending orders and opens payment reliably
4. UPI deep-link flow still restores correctly after app switch
5. Price change is caught server-side and refreshes cart cleanly
6. Unavailable item is caught server-side and shown cleanly
7. Closed seller / out-of-range delivery still blocks correctly
8. Pre-order and mixed pre-order carts still schedule correctly
9. Duplicate taps still produce only one order batch
10. No hidden in-flight request can be “cancelled” from the UI

## Files expected to change
- `supabase/migrations/...` — recreate `create_multi_vendor_orders` with authoritative validation
- `src/hooks/useCartPage.ts` — remove duplicate preflight calls and simplify checkout flow
- `src/pages/CartPage.tsx` — COD uses button loading; online-only progress UI
- `src/components/checkout/OrderProgressOverlay.tsx` — remove unsafe cancel behavior / use only as delayed fallback for long online creation

## Why this is the better plan
This does not just make the loading screen prettier or shorter. It removes the duplicated work causing the wait, moves critical validation to the backend where it belongs, and hardens the flow so the same class of checkout bugs does not come back in another form.
