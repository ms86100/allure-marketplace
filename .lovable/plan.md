

# Fix Paytm Deep Link and Payment Sheet Auto-Close

## Issue 1: Paytm not working

The scheme `paytmupi://upi/pay?...` is not the correct deep link format for Paytm. Paytm uses `paytmmp://pay?...` (Paytm Merchant Pay) or the standard `upi://pay` routed via intent. The correct working scheme is `paytmmp://upi/pay?...`.

**Fix**: Change Paytm scheme from `paytmupi` to `paytmmp` in the `UPI_APPS` array.

## Issue 2: Payment sheet auto-closes when returning to app

Two related problems:

1. **Sheet `onClose` triggers `onPaymentFailed`**: In `CartPage.tsx` line 289, `onClose={() => c.setShowUpiDeepLink(false)}` is passed separately from `onPaymentFailed`. But inside the component, `handleClose` (line 156-163) calls `onPaymentFailed()` when `step === 'pay'`. Since we set `step='confirm'` synchronously before opening the app, the sheet should be on `confirm` when user returns — but the Sheet's `onOpenChange` fires `handleClose` on any dismiss (backdrop tap, swipe down), so if the OS briefly refocuses the app before the UPI app opens, the sheet can close.

2. **Second attempt auto-places order**: After `handleUpiDeepLinkFailed` cancels orders and clears `pendingOrderIds`, the next "Place Order" creates new orders. But the cart was already cleared by `create_multi_vendor_orders`, so the cart page shows empty. The real issue is that `handleClose` in the component shouldn't call `onPaymentFailed` once the user has initiated payment (step !== 'pay').

**Fixes in `UpiDeepLinkCheckout.tsx`**:
- Track whether a payment app was opened via a ref (`hasOpenedApp`)
- Set the ref to `true` in `handlePayWithApp`
- In `handleClose`: only call `onPaymentFailed()` if `!hasOpenedApp.current` (user never tapped any app)
- If user has opened an app but closes the sheet (swipe/backdrop), don't cancel the order — just close
- The `visibilitychange` listener (lines 68-77) currently does nothing — remove the empty handler since step is already set to `confirm` synchronously

**Fix in `handleClose`**:
```
const handleClose = () => {
  if (step === 'pay' && !hasOpenedApp.current) {
    onPaymentFailed();
  }
  onClose();
};
```

## Files to modify

1. **`src/components/payment/UpiDeepLinkCheckout.tsx`**
   - Change Paytm scheme from `paytmupi` to `paytmmp`
   - Add `useRef` for `hasOpenedApp`
   - Set ref in `handlePayWithApp`
   - Update `handleClose` to check ref before calling `onPaymentFailed`
   - Remove the no-op `visibilitychange` listener

