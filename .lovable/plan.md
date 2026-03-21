

# Fix Razorpay UPI Intent Flow — Show All UPI Apps

## Problem
The current Razorpay checkout only shows PayTM as a "Recommended" UPI option and uses a QR code / VPA-entry flow. It does not show installed UPI apps (Google Pay, PhonePe, BHIM, etc.) as tap-to-pay buttons. This is because the current config lacks the proper UPI intent display blocks.

## What Changes

**Single file: `src/hooks/useRazorpay.ts`** — Update the Razorpay options `config.display` block to:

1. **Define a custom UPI intent block** that lists all major apps (`gpay`, `phonepe`, `paytm`, `any`) as clickable buttons
2. **Set UPI intent as the preferred/first block** so users see app buttons prominently before QR/VPA
3. **Hide the default Razorpay "Recommended" block** that currently only shows PayTM, replacing it with our explicit app list
4. **Keep all other methods** (Cards, Netbanking, Wallets) available as secondary options

### Razorpay Config Change

Replace the current `config` and `method` objects with:

```js
config: {
  display: {
    blocks: {
      banks: {
        name: "Pay using UPI Apps",
        instruments: [
          { method: "upi", flows: ["intent"], apps: ["gpay"] },
          { method: "upi", flows: ["intent"], apps: ["phonepe"] },
          { method: "upi", flows: ["intent"], apps: ["paytm"] },
          { method: "upi", flows: ["intent"], apps: ["any"] },  // catches other installed apps
        ],
      },
    },
    sequence: ["block.banks"],
    preferences: {
      show_default_blocks: true, // keep cards, netbanking, wallets below
    },
  },
},
```

This tells Razorpay to:
- Show GPay, PhonePe, Paytm as distinct tap-to-open buttons at the top
- Include an "any" catch-all for other installed UPI apps
- Use the `intent` flow (opens the app directly on mobile) instead of collect/QR
- Still show all other payment methods below

## How It Works for the User
1. Buyer taps "Pay Now" → Razorpay popup opens
2. Top section shows "Pay using UPI Apps" with GPay, PhonePe, Paytm icons
3. Buyer taps their preferred app → app opens directly on their phone
4. They approve payment in the app → return to your site → payment confirmed
5. On desktop, QR code and VPA entry remain available as fallback

