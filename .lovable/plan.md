

## Fix UPI Payment UX: Keyboard Overlap, Flow Simplification, Toast Noise

### Problems (from screenshots)

1. **Keyboard covers UTR input** -- user can't see what they type
2. **UTR field accepts garbage** ("Hhh") -- optional, unvalidated, unused reliably
3. **Multiple conflicting toasts** -- "Payment submitted", "Seller UPI ID not configured", "Payment already confirmed" all appear simultaneously
4. **3-step flow is unnecessary** -- pay → "did you pay?" → UTR/screenshot → confirm is too many steps

### Changes

#### 1. Simplify to 2-step flow (remove UTR step entirely)

**File: `src/components/payment/UpiDeepLinkCheckout.tsx`**

- Remove `CheckoutStep = 'utr'` -- merge confirm + submission into one step
- Remove UTR input field, screenshot upload, and all related state (`utrValue`, `screenshotFile`, `screenshotPreview`, `showUtrField`)
- The `confirm` step becomes the final step: "Yes, I paid" button directly calls `handleSubmitConfirmation` (with empty UTR and no screenshot)
- Keep screenshot upload as a future dispute-flow feature only (remove from payment flow)
- Update copy: replace "Sociva doesn't track payments..." with "Complete the payment using your UPI app. Once done, tap 'Confirm Payment' to notify the seller."
- The `handleConfirmPaid` function becomes `handleSubmitConfirmation` directly

New flow: `pay` → `confirm` (with "Confirm Payment" CTA) → `done`

#### 2. Pre-validate seller UPI ID before starting payment

**File: `src/hooks/useCartPage.ts`**

- In the UPI payment branch (line ~257), before creating orders, check if seller has `upi_id` configured
- If not, show a blocking toast: "This seller is not accepting UPI payments right now" and abort
- This prevents the current bug where orders are created, UPI sheet opens, then immediately shows "Seller UPI ID not configured" error and cancels

#### 3. Fix keyboard overlap

**File: `src/components/payment/UpiDeepLinkCheckout.tsx`**

- Since we're removing the UTR input field entirely, the keyboard overlap issue is eliminated
- The confirm step will have no text inputs -- just buttons

#### 4. Deduplicate toasts

**File: `src/components/payment/UpiDeepLinkCheckout.tsx`**

- Remove the `toast.error('Seller UPI ID is not configured...')` -- this is now handled by pre-validation in useCartPage
- In `completeFlow`, use `toast.success` with a unique `id` to prevent duplicates: `toast.success('...', { id: 'upi-confirmed' })`

**File: `src/hooks/useCartPage.ts`**

- In `handleUpiDeepLinkSuccess`, use toast with `id: 'upi-success'` to deduplicate
- In `handleUpiDeepLinkFailed`, the "Payment was already confirmed" toast should also use a unique id

#### 5. Make confirm_upi_payment idempotent (already is)

The existing `confirm_upi_payment` RPC updates `payment_status` to `buyer_confirmed` -- calling it twice is safe (same update). No change needed.

### Files to Change

| File | Change |
|------|--------|
| `src/components/payment/UpiDeepLinkCheckout.tsx` | Remove UTR step, screenshot upload, simplify to 2-step flow, update copy, deduplicate toasts |
| `src/hooks/useCartPage.ts` | Add seller UPI ID pre-validation before order creation, deduplicate toast IDs |

### What This Does NOT Change

- `confirm_upi_payment` RPC (already works without UTR)
- Session recovery logic (still works, just fewer steps to restore)
- Razorpay flow (unaffected)
- Screenshot storage bucket (kept for future dispute flow)

