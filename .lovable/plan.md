

# Hide Direct UPI When Razorpay Is Enabled

## What Changes

When the admin toggles Razorpay ON (`payment_gateway_mode = 'razorpay'`), the buyer checkout should show:
- **"Pay Online"** (Razorpay) — always available, not dependent on seller UPI config
- **"Cash on Delivery"** — based on seller's `accepts_cod` toggle

Direct UPI option disappears entirely. When Razorpay is OFF, existing behavior (seller-dependent UPI + COD) remains unchanged.

## Changes (3 files)

### 1. `src/components/payment/PaymentMethodSelector.tsx`
- Consume `isRazorpay` from `usePaymentMode()`
- When `isRazorpay === true`: replace the UPI entry with a "Pay Online" entry (Razorpay-branded, always enabled), hide direct UPI entirely
- When `isRazorpay === false`: keep current UPI behavior unchanged
- COD remains unchanged in both modes — driven by `acceptsCod` prop

### 2. `src/hooks/useCartPage.ts`
- When `paymentMode.isRazorpay`:
  - Set `acceptsUpi = true` equivalent — online payment is always available (not dependent on seller UPI ID)
  - Skip the seller UPI ID pre-validation check (line 307-308) since Razorpay doesn't need it
  - `noPaymentMethodAvailable` should account for Razorpay being available
- Auto-select payment method: if Razorpay is on and COD is unavailable, auto-select `upi` (which routes to Razorpay)

### 3. `src/pages/CartPage.tsx`
- Update the confirm dialog text: when Razorpay mode, show "Online Payment" instead of "UPI" for the payment method label

## Flow Summary

```text
Razorpay ON:
  [Pay Online (Razorpay)] — always shown, always enabled
  [Cash on Delivery]      — shown if seller accepts COD

Razorpay OFF:
  [UPI Payment]           — shown if seller has UPI configured
  [Cash on Delivery]      — shown if seller accepts COD
```

No database changes needed — the existing `admin_settings.payment_gateway_mode` toggle drives everything.

