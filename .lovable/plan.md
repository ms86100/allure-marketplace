

## Fix: Razorpay Checkout — Remove Duplicates & Compact Layout

### Root Cause

The Razorpay checkout `config.display` in `useRazorpay.ts` currently:
1. Defines a custom `block.upi` with UPI intent apps
2. Sets `show_default_blocks: true` — this causes Razorpay to **also** render its own "Recommended" and "All Payment Options" sections, which include UPI again → **triple duplication**

### Changes (single file: `src/hooks/useRazorpay.ts`)

**1. Fix `show_default_blocks` → `false`**
- This removes the "Recommended" section and prevents UPI from appearing under "All Payment Options"

**2. Add explicit blocks for Cards, Netbanking, Wallets**
- Since we're hiding default blocks, we need to define them explicitly in the `blocks` config
- Add `other` block containing cards, netbanking, wallets

**3. Update sequence to show UPI first, then other methods**
- `sequence: ['block.upi', 'block.other']`

**4. Remove the `{ method: 'upi', flows: ['intent'], apps: ['any'] }` catch-all**
- This shows a generic "UPI" entry that duplicates the app-specific ones
- Keep only gpay, phonepe, paytm (Razorpay auto-hides uninstalled apps in intent mode)

**5. Compact header via `modal.animation` option**
- Set `modal.animation = false` to reduce visual overhead on mobile

### Result
- UPI appears **once** under "Pay via UPI" with only installed apps
- Cards, Netbanking, Wallets appear under a separate section — no UPI
- "Recommended" section is gone
- Cleaner, more compact mobile layout

