
Fix this as a recovery/state-authority bug, not just a UI patch.

What’s actually happening
- The app still treats `sessionStorage` as strong truth for Razorpay recovery.
- In `src/hooks/useCartPage.ts` the mount restore effect blindly reopens Razorpay whenever a saved session exists (`loadPaymentSession()` → `setShowRazorpayCheckout(true)`), without first checking whether those orders are already paid/placed/cancelled.
- In `src/components/payment/RazorpayCheckout.tsx`, success is delayed by `setTimeout(() => onPaymentSuccess(paymentId), 800)`, and the drawer can reset back to `pending` through its local close lifecycle.
- Result: after a successful payment or delayed webhook, stale local session/UI state can resurrect the payment sheet and let the buyer see Pay Now again.

Implementation plan

1. Make backend order state the only authority for recovery
- Add a recovery check in `useCartPage.ts` before reopening any payment UI.
- On mount / app resume / retry, load saved order IDs and fetch their real backend status.
- If any order is already `paid` or no longer `payment_pending`, do not reopen Razorpay.
- Instead, clear the saved payment session and navigate straight to the order page (single order) or orders list (multi-order).

2. Replace “blind reopen” with a guarded recovery state machine
- Introduce a small recovery flow in `useCartPage.ts`:
  - `no session` → do nothing
  - `session + unpaid payment_pending orders` → allow resume
  - `session + paid/placed/advanced orders` → clear stale session and navigate away
  - `session + cancelled/missing orders` → clear stale session and do not reopen
- Use this same guard for:
  - initial mount
  - app resume restoration
  - retry pending payment

3. Remove the success-delay race in RazorpayCheckout
- In `src/components/payment/RazorpayCheckout.tsx`, stop delaying parent success with `setTimeout(..., 800)`.
- Call `onPaymentSuccess` immediately after success.
- Prevent the drawer’s local close/reset path from ever reverting UI back to `pending` after success has fired.

4. Split “payment launcher” from “payment already submitted”
- Do not reopen the pre-payment sheet after the SDK success callback has fired.
- Add a one-way completion guard that survives rerenders/remounts for the active attempt.
- Once success is seen, the only allowed next states are:
  - navigate to order page
  - show confirming state
  - recover to order page from backend status
- Never return to Pay Now for that attempt.

5. Harden stale-session cleanup
- Clear stored Razorpay session not only on local success cleanup, but also when backend recovery proves the order is already paid/advanced.
- Clear stale session if fetched orders are older than the active attempt window or no longer belong to an unpaid recovery path.
- Ensure `clearPendingPayment`, dismiss, failure, and success all use the same cleanup helper so there is one teardown path.

6. Guard against duplicate payment attempts
- Before reopening Razorpay from recovery, check whether the saved orders already have a `razorpay_payment_id` / paid status.
- If yes, block reopen completely.
- Keep the existing double-success guard, but move the reset to “new attempt starts” only.

7. Tighten user-facing recovery UX
- If recovery finds payment already received but webhook is still settling, navigate to the order page and rely on the existing “Confirming Payment…” banner there.
- Do not show the Razorpay launcher in that state.
- If recovery finds a truly unpaid pending session, show a resume-state message instead of dropping straight back into a fresh-looking Pay Now sheet.

Files to update
- `src/hooks/useCartPage.ts`
  - replace blind session restore with backend-verified recovery
  - centralize stale-session teardown
  - guard retry/reopen paths
- `src/components/payment/RazorpayCheckout.tsx`
  - remove delayed success callback
  - prevent local drawer close/reset from reviving `pending`
  - make success terminal for the current attempt
- Possibly `src/pages/CartPage.tsx`
  - if needed, conditionally render a recovery banner/state instead of immediately showing the launcher during session recovery

Why this should stop it permanently
- The bug keeps returning because local session restore can override real payment truth.
- This fix removes that class of failure entirely: saved client state becomes advisory, backend order status becomes authoritative.
- Even if callbacks race, the app reloads, the webhook is delayed, or the user resumes from background, the checkout UI cannot reopen once the backend says the payment/order has progressed.

Technical details
- Main root cause: `useCartPage.ts` mount recovery currently reopens Razorpay from saved session without status verification.
- Secondary race: `RazorpayCheckout.tsx` delays success propagation and allows local drawer state to fall back to `pending`.
- Permanent fix pattern: backend-verified recovery + terminal success state + centralized session teardown.

Validation to run after implementation
- Pay successfully and confirm the user is never shown Pay Now again for that same attempt.
- Refresh / background-resume immediately after payment success and confirm recovery goes to order page, not checkout.
- Delay webhook and confirm user sees order confirmation state, not the payment launcher.
- Multi-order Razorpay payment: if one session covers several orders, recovery should route to `/orders` and never reopen payment once any linked order is paid/advanced.
- Failed payment and dismiss paths should still allow a clean fresh retry.
