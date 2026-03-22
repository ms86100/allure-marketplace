

## QA Audit: Checkout, Payment & Order Flow — COMPLETED

All 8 bugs fixed (Bugs 1-5, 7-9). Bug 6 (variable naming) and Bug 10 (COD guard verification) are low-priority and deferred.

### Changes Made

| Bug | File | Fix |
|-----|------|-----|
| 1 | `useRazorpay.ts` | Replaced hardcoded gpay/phonepe/paytm with generic `{ method: 'upi', flows: ['intent'] }` (all installed apps) + `{ method: 'upi', flows: ['collect'] }` (manual UPI ID fallback) |
| 2 | `useCartPage.ts` | Removed direct `.update()` in `handleUpiDeepLinkSuccess` — RPC call in `UpiDeepLinkCheckout` handles the transition |
| 3 | `useCartPage.ts` | Clear cart + session in unconfirmed Razorpay branch (order exists, webhook will confirm) |
| 4 | `useCartPage.ts` | Changed `effectivePaymentMethod` from `'card'` to `'online'` for Razorpay payments |
| 5 | `useCartPage.ts` | Changed `accepts_cod` default from `true` to `false` |
| 7 | `useCartPage.ts` | Added `process-notification-queue` invocation after dismiss cancellation |
| 8 | `useCartPage.ts` | Added `idempotencyKeyRef.current = null` in `handleRazorpayFailed` |
| 9 | `useCartPage.ts` | `clearPendingPayment` now calls `buyer_cancel_pending_orders` RPC before clearing local state |
