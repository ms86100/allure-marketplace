

## Fix: Enable UPI Intent Flow in Razorpay Checkout

### Problem
The screenshot confirms Razorpay is showing generic payment method categories (UPI, Cards, Netbanking, Wallet) instead of individual UPI app buttons (GPay, PhonePe, Paytm) that users can tap to directly open.

The current config uses `config.display.preferences` and `sequence` — these only reorder categories but do **not** enable UPI Intent (tap-to-open app) buttons.

### Root Cause
The Razorpay Standard Checkout requires explicit `config.display.blocks` with `instruments` specifying each UPI app and `flows: ["intent"]` to render individual app buttons. The current code lacks this entirely.

### Fix — `src/hooks/useRazorpay.ts`

Replace the `config` object (lines 152-158) with explicit UPI Intent block configuration:

```typescript
config: {
  display: {
    blocks: {
      upi: {
        name: 'Pay via UPI',
        instruments: [
          { method: 'upi', flows: ['intent'], apps: ['google_pay'] },
          { method: 'upi', flows: ['intent'], apps: ['phonepe'] },
          { method: 'upi', flows: ['intent'], apps: ['paytm'] },
        ],
      },
    },
    sequence: ['block.upi'],
    preferences: {
      show_default_blocks: true,
    },
  },
},
```

This tells Razorpay to:
1. Show GPay, PhonePe, Paytm as individual tap-to-open buttons at the top
2. Use `intent` flow (opens the native app directly)
3. Fall back to default blocks (Cards, Netbanking, Wallet) below via `show_default_blocks: true`

### Important Note
The `blocks` API with intent instruments is a **merchant-level feature** on Razorpay. If the merchant account doesn't have it enabled, Razorpay will silently ignore the blocks config and show the default view. This change is safe and backward-compatible — it will work when the feature is active and gracefully degrade when it isn't.

### Files Changed
| File | Change |
|---|---|
| `src/hooks/useRazorpay.ts` | Replace `config.display` with explicit UPI Intent blocks |

~10 lines changed in 1 file.

