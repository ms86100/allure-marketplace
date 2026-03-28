
# P0 Plan: Prove and Fix Razorpay Confirmation Ingress on Production

## What the current code/logs already prove
- `create-razorpay-order` **did run** for live order `2b76106c-...` and created `order_SWXeuQrf1bol8Z`.
- The backend has **no evidence** that payment confirmation entered the system for that order:
  - no `confirm-razorpay-payment` logs tied to it
  - no `razorpay-webhook` logs tied to it
  - DB remains `status=payment_pending`, `payment_status=pending`, `razorpay_payment_id=NULL`
- The contradictory buyer UI is also real:
  - `OrderDetailPage.tsx:321` still shows the seller-response banner based on `isFirstFlowStep(...)`
  - that banner is **not gated against `payment_pending`**
  - so the page can show both “Waiting for seller…” and the payment-confirming banner together

## Definitive answer to the key question
Right now the system cannot truthfully say “Payment confirmation from Razorpay has been received.”
Current evidence says: **confirmation was not received or not applied by the backend** for the live order.

## Remaining root cause
Previous fixes improved DB update logic **after confirmation arrives**.
The unresolved gap is **confirmation ingress**:
1. webhook may not be reaching production backend, or
2. client-side success confirmation may not be firing/completing on the published domain/app-switch path, or
3. both are missing for some real-world flows

This is why the issue persists: the mutation logic is stronger, but the system still lacks a guaranteed way to prove and recover confirmation ingress.

## Implementation plan

### 1. Add end-to-end traceability to every payment hop
Instrument these points with structured logs using the same trace keys:
- `order_id`
- `razorpay_order_id`
- `razorpay_payment_id`
- `source` (`checkout_success`, `client_confirm`, `webhook`, `reconcile`, `auto_cancel_guard`)
- `result` (`received`, `verified`, `advanced`, `skipped`, `failed`)

Files:
- `src/hooks/useCartPage.ts`
- `src/hooks/useRazorpay.ts`
- `supabase/functions/confirm-razorpay-payment/index.ts`
- `supabase/functions/razorpay-webhook/index.ts`
- `supabase/functions/auto-cancel-orders/index.ts`

Goal: the next incident must show exactly where the chain stopped.

### 2. Fix the buyer UI so payment_pending has one state only
In `OrderDetailPage.tsx`:
- suppress the “Waiting for seller to confirm…” banner whenever `order.status === 'payment_pending'`
- keep only the payment-confirming banner during that state
- keep seller-response timer/banners strictly for post-payment seller-action states

This removes the contradictory experience immediately.

### 3. Make order-detail reconciliation authoritative
Add a backend-triggered reconciliation path from the order-detail screen for online orders stuck in `payment_pending`:
- when order detail loads for `payment_pending` + `razorpay_order_id`, call backend reconciliation
- backend checks Razorpay directly
- if captured/authorized, it advances order to `placed/paid`, clears `auto_cancel_at`, and queues seller notification
- if not captured, it returns a clear pending/failure state

This closes the current gap where success callback and webhook can both be missed.

### 4. Harden the client success path
In checkout success handling:
- log before calling confirm
- include both `razorpay_payment_id` and `razorpay_order_id` whenever available
- persist a small retryable confirmation payload before navigation/app-switch cleanup
- retry confirm on app return if the order is still `payment_pending`

This prevents silent loss after UPI/app-switch return on the published domain.

### 5. Audit and harden webhook production configuration
Verify the production webhook setup against the real backend endpoint:
- endpoint points to backend function URL, not `sociva.in`
- webhook secret matches current configured secret source
- `payment.captured` is enabled
- production delivery history exists for the affected order/payment

If delivery is failing, capture the exact cause:
- not sent
- wrong endpoint
- bad signature
- rejected/errored by backend

### 6. Keep auto-cancel as a guarded last resort only
Retain the pre-cancel Razorpay verification guard, but strengthen observability:
- log every guarded skip/cancel decision
- never cancel a `payment_pending` online order without a final reconciliation attempt
- only allow cancellation notification after a true DB transition to `cancelled`

## Expected result after this fix
- We will be able to say with evidence whether payment confirmation was received.
- If payment succeeded but webhook/client confirm was missed, the order page itself will recover the order.
- Paid orders will move to `placed/paid` and notify the seller exactly once.
- Buyers will no longer see seller-response messaging during payment confirmation.
- Future incidents will produce exact evidence instead of ambiguity.

## Proof required before closing
For one real production payment on `sociva.in`, verify:
1. Razorpay success event/payment ID exists
2. one of webhook/client-reconcile paths logs receipt
3. DB changes to `placed/paid`
4. `razorpay_payment_id` is stored
5. seller notification is queued once
6. buyer page shows only payment-confirming → placed flow, never both states at once

## Technical notes
- The current frontend contradiction is specifically in `src/pages/OrderDetailPage.tsx` lines `321-332`.
- The current backend confirm function already has the right mutation shape; the missing piece is guaranteed invocation and traceability.
- The webhook itself also looks structurally valid, so the unresolved risk is production delivery/configuration or missed client confirm after mobile return.
