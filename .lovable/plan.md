

# Bulletproof Razorpay Payment Flow — Zero-Wait, Race-Proof

## Root Cause (confirmed from code)

Two independent bugs compound into the "stuck checkout" experience:

**Bug A — `ondismiss` overwrites `handler`**: In `useRazorpay.ts`, both `handler` (success) and `modal.ondismiss` call `settleAttempt()` and fire their callbacks. But `ondismiss` fires *after* `handler` in some SDK versions, calling `options.onDismiss()` which resets the RazorpayCheckout status back to `pending`.

**Bug B — Double polling loop**: `RazorpayCheckout.verifyPaymentBackend` polls for 20s, *then* calls `onPaymentSuccess` which triggers `handleRazorpaySuccess` in `useCartPage.ts` which polls for *another* 15s. User waits 20-35s before navigation.

**Bug C — No error boundary**: If anything in `handleRazorpaySuccess` throws (network error, state issue), the user is permanently stuck — no `finally` block exists.

## Fix — 3 Files, 5 Changes

### 1. `src/hooks/useRazorpay.ts` — Suppress ondismiss after success

Add a local `successFired` flag inside `createOrder`, set it in `handler`, check it in `ondismiss`:

```typescript
// Line ~296: handler
let successFired = false;

handler: function (response: any) {
  successFired = true;  // ← prevents ondismiss from firing
  settleAttempt();
  unlockBodyScroll();
  options.onSuccess(response.razorpay_payment_id, response.razorpay_order_id);
},
modal: {
  ondismiss: function () {
    if (successFired) return;  // ← THE FIX
    settleAttempt();
    unlockBodyScroll();
    setIsLoading(false);
    options.onDismiss?.();
  },
```

### 2. `src/components/payment/RazorpayCheckout.tsx` — Remove duplicate polling, add status guard, instant navigate

**a) Remove `verifyPaymentBackend` entirely** — the parent (`useCartPage`) already handles verification and navigation. This component should only show status UI, not poll independently.

**b) Add `statusRef` to guard `onDismiss`** — if status is already `verifying`/`success`/`confirming`, refuse to reset:

```typescript
const statusRef = useRef(status);
useEffect(() => { statusRef.current = status; }, [status]);

// In onDismiss callback:
onDismiss: () => {
  if (['verifying', 'success', 'confirming'].includes(statusRef.current)) return;
  // ... existing dismiss logic
},
```

**c) On success callback from Razorpay**: Set status to `success` immediately, then call `onPaymentSuccess` after 800ms (just enough for the checkmark animation). No polling. No waiting.

```typescript
onSuccess: (paymentId) => {
  clearTimeout(processingTimeoutRef.current);
  paymentInFlightRef.current = false;
  setStatus('success');
  setTimeout(() => onPaymentSuccess(paymentId), 800);
},
```

### 3. `src/hooks/useCartPage.ts` — Bulletproof `handleRazorpaySuccess` with instant navigation

Wrap in `try/catch/finally` that **always navigates**. Reduce polling from 10×1.5s to 5×1s (5s max). Navigate in `finally` regardless:

```typescript
const handleRazorpaySuccess = async (paymentId: string) => {
  setShowRazorpayCheckout(false);
  const orderIds = [...pendingOrderIds];
  const targetOrderId = orderIds[0];

  try {
    // Store payment ID (best-effort)
    if (targetOrderId && user?.id) {
      for (const oid of orderIds) {
        await supabase.from('orders')
          .update({ razorpay_payment_id: paymentId } as any)
          .eq('id', oid).eq('buyer_id', user.id).eq('payment_status', 'pending');
      }
    }

    // Quick poll — 5 attempts, 1s apart (5s max)
    let confirmed = false;
    if (targetOrderId) {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const { data } = await supabase.from('orders')
          .select('payment_status').eq('id', targetOrderId).single();
        if (data?.payment_status === 'paid') { confirmed = true; break; }
      }
    }

    if (confirmed) {
      toast.success('Payment successful! Order placed.', { id: 'razorpay-success' });
    } else {
      toast.info('Payment received — confirming your order.', { id: 'razorpay-verifying' });
    }
  } catch (err) {
    console.error('[handleRazorpaySuccess] Error:', err);
    toast.info('Payment received. Check your orders for status.', { id: 'razorpay-fallback' });
  } finally {
    // ALWAYS navigate + clean up
    clearPaymentSession();
    const dest = orderIds.length === 1 ? `/orders/${orderIds[0]}` : '/orders';
    navigate(dest);
    setPendingOrderIds([]);
    clearCartAndCache().catch(() => {});
    supabase.functions.invoke('process-notification-queue').catch(() => {});
  }
};
```

## Timeline After Fix

```text
0ms    → Razorpay handler fires (success)
0ms    → ondismiss suppressed (successFired = true)
0ms    → RazorpayCheckout shows ✅ checkmark instantly
800ms  → onPaymentSuccess fires → handleRazorpaySuccess starts
800ms  → Checkout drawer closes, payment ID stored
1.8s   → First poll check
5.8s   → Max poll time (usually confirmed by 2-3s)
≤6s    → Navigate to order page (GUARANTEED by finally block)
```

**Worst case**: 6 seconds from payment to order page.
**Best case**: 2-3 seconds.
**Previous**: 20-40 seconds with possible permanent deadlock.

## What This Prevents

| Scenario | Before | After |
|----------|--------|-------|
| ondismiss fires after handler | UI resets to "Pay Now" | Suppressed — ignored |
| handleRazorpaySuccess throws | User stuck forever | `finally` always navigates |
| Webhook delayed 30s | User waits 35s+ | 5s poll → navigate with info toast |
| User sees "Place Order" after paying | Yes — can create duplicates | Impossible — navigated away |
| Double polling (20s + 15s) | 35s total wait | Single 5s poll only |

