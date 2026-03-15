

# Improve UPI Payment Confirmation Experience

## Current Flow
After paying via UPI app, buyer must enter a UTR (minimum 6 chars) to confirm payment. This is mandatory — the "Confirm Payment" button is disabled without it.

## Proposed Changes

### 1. Database: Add `payment_screenshot_url` column + update RPC
- Add `payment_screenshot_url TEXT` column to `orders` table
- Update `confirm_upi_payment` RPC to accept optional screenshot URL and make UTR optional (allow empty string)

### 2. Storage: Create `payment-proofs` bucket
- Create a private storage bucket for payment screenshots
- RLS: authenticated users can upload to their own folder, sellers can read proofs for their orders

### 3. Redesign the "UTR" step into a friendlier "Confirm Payment" step

Replace the current mandatory UTR screen with:

- **Empathetic message** at the top explaining that Sociva doesn't yet have automated payment tracking, and sharing a screenshot helps sellers verify faster
- **Optional screenshot upload** — tap to pick an image, shows preview with remove option
- **Optional UTR field** — still available but not required, collapsed or secondary
- **"Confirm Payment" button** — always enabled (no minimum UTR length gate)
- **"Skip, just confirm"** path — buyer can proceed with zero evidence if they choose

### 4. Update notification to seller
- Include screenshot URL if provided, and/or UTR if provided
- Adjust notification body to reflect what evidence was shared

### 5. File changes
- `src/components/payment/UpiDeepLinkCheckout.tsx` — redesign UTR step, add screenshot upload logic, make UTR optional
- `confirm_upi_payment` RPC migration — make `_upi_transaction_ref` accept empty string, add `_payment_screenshot_url` param
- Storage bucket migration for `payment-proofs`

### 6. Tone of the message
Something like: *"Sociva doesn't track payments automatically yet. To help your seller confirm your payment quickly, you can share a screenshot of the payment confirmation. This is completely optional — you can simply tap 'I Paid' to proceed."*

