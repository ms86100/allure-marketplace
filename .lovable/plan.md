

# Bulletproof Post-Payment Flow — Implementation Plan

## Problem
After Razorpay payment succeeds, user is stuck on cart page for 5-35 seconds while polling runs. Order detail shows "Unknown" status. Double-callback edge cases can cause duplicate navigation.

## Changes (4 files)

### 1. `src/hooks/useCartPage.ts`

**Add** `razorpaySuccessHandledRef` at line ~90:
```typescript
const razorpaySuccessHandledRef = useRef(false);
```

**Reset the ref** at every checkout open point (lines 126, 379, 459, 643) — add `razorpaySuccessHandledRef.current = false;` before each `setShowRazorpayCheckout(true)`.

**Replace lines 485-530** (`handleRazorpaySuccess`) entirely:
```typescript
const handleRazorpaySuccess = async (paymentId: string) => {
  if (razorpaySuccessHandledRef.current) return;
  razorpaySuccessHandledRef.current = true;

  setShowRazorpayCheckout(false);
  const orderIds = [...pendingOrderIds];

  if (!orderIds.length) {
    navigate('/orders');
    return;
  }

  // Instant overlay
  setIsPlacingOrder(true);
  setOrderStep('confirming');

  // Navigate on next frame (deterministic)
  const dest = orderIds.length === 1 ? `/orders/${orderIds[0]}` : '/orders';
  await new Promise(r => requestAnimationFrame(r));
  navigate(dest);

  // Cleanup AFTER navigation
  setTimeout(() => {
    toast.success('Payment successful! Confirming your order.', { id: 'razorpay-success' });
    clearPaymentSession();
    setPendingOrderIds([]);
    setIsPlacingOrder(false);
    clearCartAndCache().catch(() => {});
    supabase.functions.invoke('process-notification-queue').catch(() => {});
  }, 0);
};
```

**Removed**: Client-side DB update of `razorpay_payment_id` (webhook handles it), 5s polling loop.
**Added**: Double-invocation guard, empty orderIds guard, toast after navigation.

### 2. `src/types/database.ts` (line 344)

Add after `at_gate`:
```typescript
payment_pending: { label: 'Confirming Payment…', color: 'bg-amber-100 text-amber-800' },
```

### 3. `src/components/checkout/OrderProgressOverlay.tsx` (lines 55-63)

Skip delay for `confirming` step:
```typescript
useEffect(() => {
  if (!isVisible) { setShouldRender(false); return; }
  if (step === 'confirming') { setShouldRender(true); return; }
  const timer = setTimeout(() => setShouldRender(true), SHOW_DELAY_MS);
  return () => clearTimeout(timer);
}, [isVisible, step]);
```

### 4. `src/pages/OrderDetailPage.tsx` (after line 296)

Add payment confirmation banner with 15s timeout fallback:
```tsx
{o.isBuyerView && order.status === 'payment_pending' && (
  <PaymentConfirmingBanner />
)}
```

`PaymentConfirmingBanner` — inline component:
- Shows amber banner with spinner: "Payment received! Confirming your order…"
- After 15s: shows "Your payment is safe. We're still confirming with the bank." + Refresh button
- Uses `useState` + `useEffect` for the timeout

## Post-Fix Timeline
```text
0ms    → Razorpay success fires
0ms    → Overlay: "Confirming payment…" (instant)
~16ms  → navigate() to /orders/{id}
~16ms  → Order detail loads with "Confirming Payment…" badge + amber banner
2-3s   → Webhook → real-time → status updates to "Order Placed"
15s    → If still pending: reassuring message + Refresh CTA
```

## Edge Cases Covered

| Scenario | Protection |
|----------|-----------|
| Double success callback | `razorpaySuccessHandledRef` guard, reset on checkout open |
| Empty orderIds | Guard → fallback to `/orders` |
| "Unknown" status | `payment_pending` mapped explicitly |
| Overlay gap after Razorpay closes | Instant show for `confirming` step |
| Client writes payment data | Removed — webhook is sole authority |
| Webhook delayed >15s | Timeout banner with refresh CTA |
| Toast disappears on navigate | Toast fires after navigation |

