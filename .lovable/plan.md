

# UPI Deep Link Payment System with Seller Confirmation

## What We're Building

An interim payment system using UPI deep links (direct to seller's UPI ID) with dual-confirmation verification (buyer declares + seller confirms), controlled by an admin toggle that can switch to Razorpay when ready.

## Architecture

```text
Admin Toggle: payment_gateway_mode = "upi_deep_link" | "razorpay"

When upi_deep_link:
  Buyer → UPI deep link (upi://pay?pa=seller@upi&am=250&tn=ORD_abc123)
       → Returns to app → Declares "I paid" + enters UTR
       → Seller gets notification → Confirms "Payment received"
       → Order proceeds

When razorpay:
  Existing Razorpay flow (unchanged)
```

## Database Changes (1 migration)

1. **Add `payment_gateway_mode` to `admin_settings`** — insert row with key `payment_gateway_mode`, value `upi_deep_link`, `is_active = true`
2. **Add columns to `orders` table**:
   - `upi_transaction_ref text` — UTR/transaction ID from buyer
   - `payment_confirmed_by_seller boolean default null` — seller's confirmation
   - `payment_confirmed_at timestamptz` — when seller confirmed
3. **Update `payment_status` handling** — add `buyer_confirmed` as a recognized status in the frontend `PaymentStatus` type and labels

No new tables needed. No storage bucket needed (no screenshot upload — UTR + dual confirmation is sufficient per your approved approach).

## Implementation Plan

### 1. New Hook: `usePaymentMode`
- Reads `payment_gateway_mode` from `admin_settings` table
- Returns `{ mode: 'upi_deep_link' | 'razorpay', isLoading }`
- Cached with React Query

### 2. New Component: `UpiDeepLinkCheckout.tsx`
Bottom sheet (same pattern as `RazorpayCheckout.tsx`) with 3 states:

**State 1 — Pay**: Shows order amount, seller name, QR code (using existing `qrcode.react`), and "Pay with UPI" button that opens `upi://pay?pa={seller_upi}&pn={seller_name}&am={amount}&cu=INR&tn=ORD_{order_id_short}`

**State 2 — Confirm**: After returning from UPI app: "Did you complete the payment?" with three buttons (Yes / Pay Again / Cancel). On "Yes" → show UTR input field (required, 12-char alphanumeric validation).

**State 3 — Done**: Success state. Updates order `payment_status` to `buyer_confirmed` and stores `upi_transaction_ref`.

### 3. Modify `useCartPage.ts`
- Import `usePaymentMode`
- When `paymentMethod === 'upi'`:
  - If mode is `upi_deep_link` → open `UpiDeepLinkCheckout` sheet (new state: `showUpiDeepLink`)
  - If mode is `razorpay` → existing Razorpay flow (unchanged)
- Add `handleUpiDeepLinkSuccess` handler that navigates to order page
- Add `showUpiDeepLink` / `setShowUpiDeepLink` to returned state

### 4. Modify `CartPage.tsx`
- Import `UpiDeepLinkCheckout`
- Conditionally render `UpiDeepLinkCheckout` OR `RazorpayCheckout` based on payment mode
- Pass seller's `upi_id` from `sellerGroups[0]` to the UPI sheet

### 5. New Component: `SellerPaymentConfirmation.tsx`
Banner shown on `OrderDetailPage.tsx` when:
- `isSellerView === true`
- `payment_status === 'buyer_confirmed'`
- `payment_confirmed_by_seller` is null

Shows: "Buyer claims UPI payment of ₹{amount}. UTR: {ref}. Verify in your bank app and confirm."

Two buttons: "Payment Received ✓" / "Not Received ✗"
- Received → updates `payment_status = 'paid'`, `payment_confirmed_by_seller = true`, `payment_confirmed_at = now()`
- Not Received → updates `payment_status = 'disputed'`, `payment_confirmed_by_seller = false`

### 6. Modify `OrderDetailPage.tsx`
- Import and render `SellerPaymentConfirmation` in the payment card section
- Show UTR reference in the payment card for both buyer and seller views when available

### 7. Admin Toggle in `CredentialsManager.tsx`
Add a new tab or card at the top of the Payment tab:
- "Payment Mode" toggle: UPI Deep Link ↔ Payment Gateway
- Reads/writes `payment_gateway_mode` in `admin_settings`
- When Razorpay keys are not configured, show note that gateway mode requires keys first

### 8. Update `PaymentMethodSelector.tsx`
- When mode is `upi_deep_link`, change UPI description to "Pay directly via UPI app" instead of "Pay via Razorpay"
- Dynamic label based on payment mode

### 9. Update Types
- `PaymentStatus` in `types/database.ts`: add `'buyer_confirmed' | 'disputed'`
- `PAYMENT_STATUS_LABELS`: add labels for new statuses

### 10. Notification Trigger
Add a database trigger or handle in the `UpiDeepLinkCheckout` success handler:
- When buyer confirms → insert into `notification_queue` for seller: "Payment confirmation needed for Order #{short_id}"
- When seller confirms/disputes → insert notification for buyer

## What Stays Unchanged
- `RazorpayCheckout.tsx` — untouched, conditionally rendered
- `useRazorpay.ts` — untouched
- `create-razorpay-order` edge function — untouched
- COD flow — completely unaffected
- `create_multi_vendor_orders` RPC — no changes needed
- Multi-seller cart logic — UPI deep link only works for single-seller carts (same constraint as current Razorpay UPI)

## File Summary

| File | Action |
|------|--------|
| DB migration | Add columns + admin setting |
| `src/hooks/usePaymentMode.ts` | Create |
| `src/components/payment/UpiDeepLinkCheckout.tsx` | Create |
| `src/components/payment/SellerPaymentConfirmation.tsx` | Create |
| `src/hooks/useCartPage.ts` | Modify — branch on payment mode |
| `src/pages/CartPage.tsx` | Modify — render UPI sheet conditionally |
| `src/pages/OrderDetailPage.tsx` | Modify — show UTR + seller confirmation |
| `src/components/admin/CredentialsManager.tsx` | Modify — add payment mode toggle |
| `src/components/payment/PaymentMethodSelector.tsx` | Modify — dynamic UPI label |
| `src/types/database.ts` | Modify — add payment status types |

