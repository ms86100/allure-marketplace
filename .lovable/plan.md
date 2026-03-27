

# Fix: Razorpay Popup Not Opening + Duplicate Order Creation

## What's happening

**Problem 1 — Popup blocked in preview iframe**: The Razorpay SDK injects its own iframe/modal overlay when `razorpay.open()` is called. Inside the Lovable preview (which itself runs in an iframe), the SDK's popup is silently blocked or immediately dismissed by browser security. The `modal.ondismiss` callback fires, resetting status to `'pending'` — which is why you see the spinner then back to Cancel/Pay Now with no error message.

This is **not a code bug** — it's an iframe sandbox restriction. Razorpay will work correctly on your published site or in a standalone browser tab.

**Problem 2 — Duplicate Razorpay orders**: The console logs show **4 separate Razorpay orders** created for the same internal order ID. Each "Pay Now" tap creates a new Razorpay order because the edge function doesn't check if one already exists. This wastes Razorpay API calls and creates orphaned payment records.

**Problem 3 — Silent failure**: When the popup fails to open (or is dismissed immediately), the user gets no feedback — just back to the buttons. There should be a clear message explaining what happened.

## Plan

### 1. Reuse existing Razorpay order instead of creating duplicates
**File**: `supabase/functions/create-razorpay-order/index.ts`

Before creating a new Razorpay order, check if the order already has a valid `razorpay_order_id`. If it does, fetch the existing Razorpay order status from the API. If it's still `created` or `attempted`, return that order instead of creating a new one. Only create a fresh order if the previous one is expired or failed.

### 2. Add iframe detection and user guidance
**File**: `src/hooks/useRazorpay.ts`

After `razorpay.open()`, set a short timeout (~2s) to check if the Razorpay SDK actually injected its modal into the DOM. If no Razorpay iframe/overlay is found, it means the popup was blocked. In that case, call `onFailure` with a specific error type instead of silently waiting for the 15s timeout.

### 3. Show actionable error when popup is blocked
**File**: `src/components/payment/RazorpayCheckout.tsx`

Add a new status state `'blocked'` that shows a message like: "Payment window couldn't open. Please try on the published app or open in a new tab." with a button to copy the published URL or retry.

### 4. Disable Pay Now button while processing
**File**: `src/components/payment/RazorpayCheckout.tsx`

The `handlePayment` function doesn't guard against double-taps. Add a guard so clicking "Pay Now" while already processing is ignored — preventing the 4x duplicate order creation seen in logs.

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/create-razorpay-order/index.ts` | Check for existing valid Razorpay order before creating new one |
| `src/hooks/useRazorpay.ts` | Detect popup-blocked after `open()`, fire failure instead of silent reset |
| `src/components/payment/RazorpayCheckout.tsx` | Add `blocked` state with guidance message; guard against double-tap |

## Risk assessment
- **Reusing Razorpay orders**: Safe — Razorpay API supports fetching order status. If the order expired, we create a new one as fallback.
- **Iframe detection**: Uses DOM presence check, not a hack. If Razorpay changes its DOM structure, worst case is the old 15s timeout behavior (no regression).
- **Double-tap guard**: Pure UI guard, zero backend risk.

