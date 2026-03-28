
Fix this as a backend-authority + UI-state bug, not another partial patch.

What I confirmed
- The live stuck order is `ab6b3840-...` and is still `status=payment_pending`, `payment_status=pending`, `razorpay_payment_id=NULL`.
- Its `payment_records` row also remains `pending` with no Razorpay payment ID.
- `create-razorpay-order` did run successfully for this order.
- `razorpay-webhook` shows no logs for the capture, so the backend never received/applied the success event for this payment attempt.
- The contradictory buyer screen is also a real frontend bug:
  - `UrgentOrderTimer` is shown for any non-terminal order with `auto_cancel_at`, so it incorrectly says “Waiting for seller to respond” during `payment_pending`.
  - The payment card maps `payment_type='online'` to “UPI Payment”, which is wrong.

Root cause
1. Payment success still depends too heavily on the webhook arriving.
2. When the webhook does not arrive or is delayed, the order stays in `payment_pending`.
3. The order-detail UI then mixes two unrelated states:
   - payment confirmation state
   - seller response countdown state
4. If left alone, auto-cancel will eventually cancel a genuinely paid order.

Bulletproof implementation plan

1. Add an immediate backend payment-confirm step after Razorpay success
- Create a backend function that receives `razorpay_payment_id`, `razorpay_order_id`, and `order_ids`.
- Inside that function:
  - verify the payment directly with Razorpay API
  - confirm it is captured/authorized for the expected order + amount
  - idempotently upsert `payment_records`
  - update `orders` from `payment_pending/pending` to `placed/paid`
  - write `razorpay_payment_id`
  - clear `auto_cancel_at`
  - enqueue seller notification only if rows actually changed
- Keep the existing webhook as fallback, but stop making it the only success path.

2. Change buyer success flow to call backend confirmation, not just navigate away
- In the Razorpay success handler, call the new backend confirmation immediately.
- If confirmation succeeds, route to the order page in confirmed state.
- If confirmation is still processing, route to order page with a short-lived “confirming” state and polling/retry.
- Never leave the order in indefinite `payment_pending` just because the webhook was missed.

3. Reconcile stale paid-but-pending orders
- Add a backend recovery path for orders stuck in `payment_pending` with a `razorpay_order_id`.
- For stale online orders, verify with Razorpay before auto-cancelling.
- This prevents future repeats when:
  - webhook delivery fails
  - buyer closes app after payment success
  - provider callback is delayed

4. Fix the contradictory buyer UI
- Only show “Waiting for seller to respond” timer for the true first seller-response state (`placed`/first flow step), not for `payment_pending`.
- For `payment_pending`, show only the payment-confirmation banner/state.
- Clear the timer once payment is confirmed.

5. Fix payment method labeling
- Treat `payment_type='online'` as “Online Payment”.
- Do not render it as “UPI Payment”.

6. Harden auto-cancel logic
- Before cancelling online `payment_pending` orders, add a verification/reconciliation guard.
- Paid orders must never be auto-cancelled solely because local DB state is stale.

Files to update
- `src/hooks/useCartPage.ts`
- `src/pages/OrderDetailPage.tsx`
- `src/components/order/UrgentOrderTimer.tsx` or the order-detail gating around it
- `supabase/functions/razorpay-webhook/index.ts`
- new backend function for direct Razorpay payment confirmation
- `supabase/functions/auto-cancel-orders/index.ts`
- possibly a small migration only if needed for stronger reconciliation metadata

Expected outcome
- Paid orders move to `placed/paid` even if webhook is delayed or missing.
- Seller gets the correct new-order notification exactly once.
- Buyer never sees “Waiting for seller to respond” during payment confirmation.
- “Online Payment” displays correctly.
- Auto-cancel cannot kill a genuinely paid order because of stale backend state.
