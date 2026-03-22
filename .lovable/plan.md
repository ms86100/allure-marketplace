

## QA Audit: Checkout, Payment & Order Flow

### Razorpay UPI Intent Answer

The current config at lines 159-163 specifies only three UPI apps: `gpay`, `phonepe`, `paytm` with `flows: ['intent']`. Razorpay's intent mode auto-hides apps not installed on the device, so the buyer only sees installed ones from that list. **However**, if a buyer uses a different UPI app (BHIM, Amazon Pay, Cred, etc.), they have no way to pay via UPI at all. The `show_default_blocks: false` setting removes the fallback "Enter UPI ID" option entirely. This is Bug 1 below.

---

### 10 Critical Bugs

**Bug 1: UPI App Whitelist Too Restrictive — No Fallback for Other UPI Apps**
- Config hardcodes only gpay/phonepe/paytm. Users with BHIM, Amazon Pay, Cred, or bank-specific UPI apps see zero UPI options.
- `show_default_blocks: false` removes the "Enter UPI ID manually" fallback that Razorpay normally provides.
- Fix: Add a `{ method: 'upi', flows: ['collect'] }` instrument to the `upi` block or add `{ method: 'upi', flows: ['intent'] }` without specifying apps (shows all installed UPI apps).

**Bug 2: Client-Side Status Transition in `handleUpiDeepLinkSuccess` Bypasses RPC**
- Lines 560-566: Directly updates `status: 'placed', payment_status: 'buyer_confirmed'` via `.update()` on the orders table. This bypasses the `confirm_upi_payment` RPC that was just fixed to handle `payment_pending`.
- The RPC does proper validation; the direct update does not.
- Fix: Use `confirm_upi_payment` RPC instead of direct update.

**Bug 3: `handleRazorpaySuccess` Doesn't Clear Cart on Unconfirmed Payment**
- Lines 499-502: If webhook is slow (payment not confirmed after 15s polling), user navigates to orders page but cart is NOT cleared and payment session is NOT cleared. On next visit to cart, they see all items + may re-order.
- Fix: Clear payment session and cart even on unconfirmed navigation (the order exists, webhook will confirm it).

**Bug 4: `effectivePaymentMethod` Sends 'card' for Razorpay Instead of Contextual Method**
- Line 238: Forces `paymentMethod` to `'card'` for all Razorpay payments. The RPC's `_payment_method <> 'cod'` guard works correctly, but the stored `payment_method` on the order will say `card` even if buyer paid via UPI inside Razorpay. This affects seller reporting and reconciliation.
- Fix: Use `'online'` or `'razorpay'` as the payment method identifier instead of `'card'`.

**Bug 5: Seller's `accepts_cod` Default Assumption is `true`**
- Lines 148-150: `firstSeller?.accepts_cod ?? true` defaults to true if the field is null/undefined. A new seller who hasn't configured payment preferences will appear to accept COD by default.
- Impact: Seller receives COD orders they never opted into.
- Fix: Default to `false` instead of `true`, or require seller onboarding to set this explicitly.

**Bug 6: Multi-Vendor Cart Ignores Per-Seller UPI Availability in Razorpay Mode**
- Line 152-153: When Razorpay is enabled, `acceptsUpi` is forced to `true` regardless of seller count. This is correct for online payment, but the variable name `acceptsUpi` is misleading and used in guards elsewhere. If Razorpay mode is disabled mid-session, multi-vendor UPI orders would fail silently.
- Low severity but confusing for maintainability.

**Bug 7: `handleRazorpayDismiss` Cancels Orders But Doesn't Notify Seller**
- Lines 536-547: Calls `buyer_cancel_pending_orders` RPC but doesn't invoke `process-notification-queue`. If the order briefly appeared to the seller (e.g., a race where webhook ran before dismiss), the seller sees an order that disappears without notification.
- Fix: Add `supabase.functions.invoke('process-notification-queue').catch(() => {})` after cancellation.

**Bug 8: Idempotency Key Not Reset on Razorpay Dismiss**
- Line 545 does reset it, but `handleRazorpayFailed` at line 529 does NOT reset `idempotencyKeyRef.current`. If the user retries after a failed payment, the stale key may trigger deduplication and return the old (now cancelled) order IDs.
- Fix: Add `idempotencyKeyRef.current = null` in `handleRazorpayFailed`.

**Bug 9: `clearPendingPayment` Doesn't Cancel Orders in DB**
- Lines 611-615: Only clears local state. If a user clicks "Cancel Payment" from the pending-payment UI in CartPage, orders remain in `payment_pending` in DB until the 30-minute auto-cancel.
- Fix: Call `buyer_cancel_pending_orders` RPC before clearing local state.

**Bug 10: COD Flow Sends `payment_status: 'pending'` — RPC May Create as `payment_pending`**
- Line 461: COD calls `createOrdersForAllSellers('pending')`. The `effectivePaymentMethod` at line 238 correctly maps to `'cod'`, but this depends on the RPC's `_payment_method <> 'cod'` guard being correct. If the guard has a bug or was not deployed, COD orders get stuck in `payment_pending`.
- This was identified in the previous audit. Verify deployment status.

---

### Top 5 Critical Bugs — Deep Analysis

#### Bug 1: UPI App Whitelist Too Restrictive
- **Why critical**: Buyers with BHIM, Cred, Amazon Pay, or bank UPI apps cannot pay. India has 20+ UPI apps. Hardcoding 3 excludes a significant user base.
- **Affected modules**: `useRazorpay.ts` config, payment conversion rate
- **Fix**: Add a generic `{ method: 'upi' }` instrument without app restriction, or add `flows: ['collect']` for manual UPI ID entry as a fallback
- **Risk**: Adding too many options may re-introduce the "duplicate UPI" clutter. Mitigation: Use a single `{ method: 'upi', flows: ['intent'] }` without `apps` filter (Razorpay auto-detects all installed apps) plus one `{ method: 'upi', flows: ['collect'] }` for manual entry.

#### Bug 2: Direct Status Update Bypasses RPC in UPI Success
- **Why critical**: The `confirm_upi_payment` RPC was specifically fixed to handle `payment_pending` → `placed` transitions with proper validation. Lines 560-566 bypass it entirely with a raw `.update()`, which could succeed even without proper auth context if RLS is permissive.
- **Affected modules**: UPI payment confirmation, order status integrity, seller notifications
- **Fix**: Replace the direct update with `supabase.rpc('confirm_upi_payment', { _order_id, _upi_transaction_ref, _payment_screenshot_url })`. The RPC already handles the status transition.
- **Risk**: The `confirm_upi_payment` RPC requires `_upi_transaction_ref` and `_payment_screenshot_url` which are collected in the UPI deep link component, not passed to `handleUpiDeepLinkSuccess`. Need to thread these parameters through, or accept that the RPC call happens inside `UpiDeepLinkCheckout` already and remove the duplicate client-side update.

#### Bug 3: Unconfirmed Razorpay Payment Leaves Stale Cart + Session
- **Why critical**: After paying successfully via Razorpay but with a slow webhook, the user navigates away with cart intact and session not cleared. They could accidentally re-order the same items.
- **Affected modules**: Cart state, payment session, order duplication risk
- **Fix**: In the `!confirmed` branch (line 499), still clear cart and payment session. The order exists in DB; the webhook will confirm it.
- **Risk**: If Razorpay payment actually failed silently (rare), the user loses their cart. Acceptable tradeoff since the payment ID was already stored on the order.

#### Bug 8: Idempotency Key Not Reset on Payment Failure
- **Why critical**: After `handleRazorpayFailed` cancels orders, the idempotency key persists. Next checkout attempt uses the same key, hits the DB dedup guard, and returns the cancelled order IDs instead of creating new ones. User sees "order placed" but it's actually cancelled.
- **Affected modules**: Order creation, idempotency system, checkout flow
- **Fix**: Add `idempotencyKeyRef.current = null` at line 530 in `handleRazorpayFailed`.
- **Risk**: None — straightforward fix.

#### Bug 9: `clearPendingPayment` Doesn't Cancel DB Orders
- **Why critical**: The "Cancel Payment" button on the pending-payment UI (CartPage) only clears local state. Orders sit in `payment_pending` for 30 minutes, during which the buyer cannot place new orders (the pending order guard will catch them on next attempt if the auto-cancel hasn't run yet).
- **Affected modules**: CartPage pending payment UI, order lifecycle
- **Fix**: Make `clearPendingPayment` async — call `buyer_cancel_pending_orders` with current `pendingOrderIds` before clearing local state.
- **Risk**: If RPC fails, local state is cleared but DB orders persist. Add error handling to show a toast and not clear local state on failure.

---

### Implementation Plan

**Phase 1 — Immediate (Bugs 1, 2, 3, 8, 9)**

| Bug | File | Change |
|-----|------|--------|
| 1 | `useRazorpay.ts` | Add generic `{ method: 'upi' }` instrument + `{ method: 'upi', flows: ['collect'] }` fallback |
| 2 | `useCartPage.ts` L560-566 | Remove direct `.update()` — the RPC call already happens in `UpiDeepLinkCheckout` |
| 3 | `useCartPage.ts` L499-502 | Clear cart + session in the `!confirmed` branch |
| 8 | `useCartPage.ts` L529 | Add `idempotencyKeyRef.current = null` |
| 9 | `useCartPage.ts` L611-615 | Make `clearPendingPayment` call `buyer_cancel_pending_orders` |

**Phase 2 — Follow-up (Bugs 4, 5, 7)**

| Bug | File | Change |
|-----|------|--------|
| 4 | `useCartPage.ts` L238 | Change `'card'` to `'online'` (requires adding to payment_method enum) |
| 5 | `useCartPage.ts` L148-150 | Change `?? true` to `?? false` |
| 7 | `useCartPage.ts` L540 | Add notification queue invocation after cancel |

### Impact Analysis

| Module | Risk if fixed |
|--------|--------------|
| Razorpay checkout UI | More UPI options shown — verify no duplication returns |
| UPI confirmation | Removing direct update means relying solely on RPC — verify RPC is deployed |
| Cart clearing | Aggressive clearing on unconfirmed payment — acceptable since order exists |
| Idempotency | Reset allows fresh order creation — correct behavior |
| Pending payment UI | Cancel now hits DB — add error handling for resilience |

