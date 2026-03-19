

# Fix Payment Flow, Seller Verification & OTP Status Issues

## Root Causes Found

### Issue 1: UPI Confirmation "stuck at Submitting" without screenshot
The `confirm_upi_payment` RPC accepts empty UTR and null screenshot, so technically it should work. However, the `confirmSubmittedRef` idempotency guard blocks re-attempts after the first call. If the visibility-change handler fires mid-flow or a transient network error occurs, the guard stays locked. The user's request: make screenshot mandatory and prevent submission without it.

### Issue 2: Seller cannot view payment proof
`SellerPaymentConfirmation.tsx` receives `utrRef` but never fetches or displays `payment_screenshot_url`. The order data already includes this column, but it's not passed to the component.

### Issue 3: OTP → "Invalid status transition from On the Way to Completed"
**This is the critical bug.** The `verify_delivery_otp_and_complete` RPC (migration `20260319044026`) sets `status = 'completed'` directly. But the `seller_delivery` transition table only allows:
```text
on_the_way → delivered (seller)
delivered  → completed (buyer/system)
```
So the DB trigger rejects `on_the_way → completed` as invalid. The RPC must transition to `delivered`, not `completed`.

### Issue 4: OTP error feedback
The dialog shows a toast on error, but no inline visual feedback. Users may miss the toast.

---

## Plan

### 1. Fix OTP RPC: transition to `delivered` not `completed`
**File:** New migration SQL

Update `verify_delivery_otp_and_complete` to set `status = 'delivered'` instead of `status = 'completed'`. This aligns with the `seller_delivery` workflow where `on_the_way → delivered` is a valid seller transition, and `delivered → completed` happens via buyer confirmation.

The `app.otp_verified` config is already set before the UPDATE, so the delivery-code guard in the trigger will pass.

### 2. Make screenshot mandatory for UPI confirmation
**File:** `src/components/payment/UpiDeepLinkCheckout.tsx`

- Change the label from "optional" to **"required"** on the screenshot upload area
- Disable the "Confirm Payment" button when no screenshot is attached
- Show inline validation message: "Upload payment screenshot to confirm"
- Reset `confirmSubmittedRef` more aggressively on component mount/step change to prevent stuck states

### 3. Show payment proof to seller
**File:** `src/components/payment/SellerPaymentConfirmation.tsx`

- Add `screenshotUrl` prop (passed from `OrderDetailPage`)
- When present, render an inline thumbnail (max-h-32, rounded, tap to enlarge in a dialog)
- Text label: "Payment proof attached" or "No proof attached"

**File:** `src/pages/OrderDetailPage.tsx`

- Pass `(order as any).payment_screenshot_url` to the `SellerPaymentConfirmation` component

### 4. Improve OTP error feedback
**File:** `src/components/delivery/DeliveryCompletionOtpDialog.tsx`

- Add inline error state below the OTP input (red text: "Invalid code, please try again")
- Clear error on OTP change
- Keep the toast as secondary feedback

### Technical Details

**Migration SQL (Issue 3):**
```sql
-- Fix: transition to 'delivered' instead of 'completed'
-- The buyer confirmation step moves delivered → completed
UPDATE in verify_delivery_otp_and_complete:
  SET status = 'delivered'  -- was 'completed'
RETURN 'delivered'::order_status  -- was 'completed'
```

**Files modified:**
- `src/components/payment/UpiDeepLinkCheckout.tsx` — screenshot mandatory, button guard
- `src/components/payment/SellerPaymentConfirmation.tsx` — inline screenshot preview
- `src/pages/OrderDetailPage.tsx` — pass screenshot URL prop
- `src/components/delivery/DeliveryCompletionOtpDialog.tsx` — inline error state
- New migration — fix `verify_delivery_otp_and_complete` RPC

