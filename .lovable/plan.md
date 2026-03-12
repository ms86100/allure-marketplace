

# Fix UPI Payment App Selection and Post-Payment Flow

## Problem 1: WhatsApp UPI Default
The generic `upi://pay?` scheme opens whatever the OS default is (often WhatsApp). Users expect GPay, PhonePe, or Paytm.

**Fix**: Replace the single "Pay Now" button with a 3-app picker grid:
- **GPay** → `tez://upi/pay?...`
- **PhonePe** → `phonepe://pay?...`
- **Paytm** → `paytmupi://pay?...`

No generic "Other UPI" fallback — these three cover the vast majority of Indian UPI users.

## Problem 2: Flash of "Yes, I paid" then Empty Cart
The `setTimeout(() => setStep('confirm'), 1500)` races with app backgrounding. When the user returns, the step may still be `pay`, and if the sheet closes, `onPaymentFailed` fires.

**Fix**:
- Set `step='confirm'` synchronously on tap (before `window.open`)
- Add a `visibilitychange` listener: when user returns to the app and step is still `pay`, advance to `confirm`

## File to Modify

### `src/components/payment/UpiDeepLinkCheckout.tsx`
- Define a `UPI_APPS` array: `[{ name: 'Google Pay', scheme: 'tez', icon, color }, { name: 'PhonePe', scheme: 'phonepe', icon, color }, { name: 'Paytm', scheme: 'paytmupi', icon, color }]`
- Replace single "Pay Now" button with a 3-button grid, each building its own deep link
- `handlePayWithApp(scheme)`: set `step='confirm'` first, then `window.open(appLink)`
- Add `useEffect` with `visibilitychange` listener to catch returning users
- Remove the `setTimeout` entirely

No other files need changes.

