

# Fix: "Verify & Deliver" Button Shows Wrong Label

## Root Cause

The button text on line 662 is hardcoded to `"Verify & Deliver"` for ALL delivery OTP steps. So when the seller is at `accepted` and the next step is `preparing` (which has `otp_type = 'delivery'`), the button says "Verify & Deliver" — making it appear the system is skipping to the final step.

The step progression is actually correct (`accepted → preparing`). Only the label is wrong.

Similarly, the buyer-side delivery OTP button on line 692 is hardcoded to `"Verify & Confirm"`.

## Fix

**In `src/pages/OrderDetailPage.tsx`:**

1. **Line 662** — Replace hardcoded `'Verify & Deliver'` with the dynamic flow step label:
   ```
   `Verify & ${o.getFlowStepLabel(o.nextStatus).label}`
   ```
   This matches how generic OTP already works on line 667.

2. **Line 692** — Same fix for buyer delivery OTP button:
   ```
   `Verify & ${o.getFlowStepLabel(o.buyerNextStatus).label}`
   ```

## Secondary Issue: Likely Misconfiguration

The DB shows `preparing` has `otp_type = 'delivery'`, meaning the seller must enter an OTP just to mark the order as "Preparing". This is almost certainly unintended — the admin likely meant to put delivery OTP on the `delivered` step (sort 70), not `preparing` (sort 30). No code change needed for this — admin needs to move the OTP config to the correct step.

## One file changed

`src/pages/OrderDetailPage.tsx` — two line changes (seller button label + buyer button label)

