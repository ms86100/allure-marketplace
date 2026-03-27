
Do I know what the issue is? Yes.

The current “payment succeeded but buyer sees a crash/error page” is still happening because there is one remaining race the previous fixes did not remove:

1. `RazorpayCheckout` still lets the drawer close lifecycle behave like a payment dismissal/failure path.
2. After success, the parent closes the drawer immediately, but `Drawer onOpenChange` is wired to `handleClose()` without checking whether the close was a success handoff or a real user dismiss.
3. That means a successful payment can still fall into cancel/failure cleanup, which explains why the latest online order for this buyer ended up as `status=cancelled, payment_status=pending`.
4. Then the app navigates to `/orders/:id`, but the order page is being opened for a half-settled / inconsistent order state and the route-level boundary takes over.

Latest evidence from the backend:
- most recent online order: `07b6404d-d0b5-4d73-9657-32fa8db7d914`
- state: `cancelled` + `pending`
- that should never happen immediately after a genuine Razorpay success handoff

Plan to make this bulletproof:

1. Make Razorpay success terminal at the component level
- Update `src/components/payment/RazorpayCheckout.tsx`
- Replace the current “any close = handleClose” behavior with an explicit close-state handler.
- Add a one-way attempt state machine:
  - `idle`
  - `opening`
  - `awaiting_gateway`
  - `success_handoff`
  - `failed`
  - `dismissed`
- Once success fires, the component must:
  - ignore all later `onOpenChange(false)`
  - ignore later `ondismiss`
  - never call `onPaymentFailed`
  - never call `onDismiss`
- Parent-driven close after success becomes a silent unmount only.

2. Separate success cleanup from unpaid-order cancellation
- Update `src/hooks/useCartPage.ts`
- Create two clearly separate paths:
  - `finalizeSuccessfulOnlinePayment(orderIds)`
  - `cancelUnpaidOnlineAttempt(orderIds)`
- Any code path that calls `buyer_cancel_pending_orders` must first check whether success has already been handed off.
- After success is marked, cancellation RPCs become impossible for that attempt.

3. Move authority for post-success routing to a single guarded handoff
- In `useCartPage.ts`, introduce a dedicated “payment submitted / settling” flag for the active attempt.
- On success:
  - mark the attempt as settling
  - close the payment UI
  - navigate with `replace` to the order destination
  - defer only non-critical cleanup
- Recovery, retry, dismiss, clear-cart, and back-navigation guards must all respect this settling state.

4. Harden recovery so stale local state can never override a settled attempt
- Keep backend verification as the source of truth, but extend it:
  - if order is paid, placed, accepted, preparing, ready, delivered, completed, or otherwise advanced: never reopen/cancel
  - if order is cancelled: clear stale session and do not resume payment
  - only true unpaid `payment_pending` orders may resume
- Apply this same rule to:
  - mount restore
  - retry payment
  - clear pending payment
  - cart empty recovery state

5. Make the order detail page resilient to half-settled payment states
- Update `src/pages/OrderDetailPage.tsx` and `src/hooks/useOrderDetail.ts`
- Prevent route-boundary crashes by guarding render paths when:
  - the current order status is not yet present in the resolved workflow
  - related joins are temporarily missing
  - the order is cancelled while the page is opening
- Use local safe fallbacks instead of letting render blow up:
  - safe status chip
  - safe payment card
  - disable action bars when status is unresolved
  - skip delivery widgets unless their data is valid
- If the order is cancelled or missing after navigation, show a controlled payment-resolution state instead of a hard error boundary.

6. Remove the final modal-close race entirely
- Audit all close paths in:
  - `src/components/payment/RazorpayCheckout.tsx`
  - `src/pages/CartPage.tsx`
  - `src/hooks/useCartPage.ts`
- Ensure there is only one actor allowed to end an attempt:
  - success handoff
  - explicit failure
  - explicit dismiss before success
- Never let both modal lifecycle and parent lifecycle try to settle the same attempt.

Files to update
- `src/components/payment/RazorpayCheckout.tsx`
- `src/hooks/useCartPage.ts`
- `src/pages/CartPage.tsx`
- `src/pages/OrderDetailPage.tsx`
- `src/hooks/useOrderDetail.ts`

Expected outcome
- Razorpay success can no longer be “undone” by a close callback
- successful payment attempts cannot be cancelled by stale cleanup
- buyer never sees “Pay Now” again for the same successful attempt
- buyer lands on a stable order page with a safe confirming state, never the route crash screen

Validation after implementation
- Successful Razorpay payment: no cancel RPC fires afterward
- Successful payment + immediate route change: order page loads without route boundary
- Successful payment + app background/foreground: never reopens payment drawer
- Failed/dismissed payment before success: still cancels unpaid pending orders correctly
- Multi-order success: same terminal protection and safe redirect to `/orders`
