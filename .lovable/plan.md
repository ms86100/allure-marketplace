

# Fix Plan: Razorpay Payment Loop + Safe Area Regression

## Issue 1: Razorpay Payment Flow Loop

### Root Cause

The `RazorpayCheckout` drawer (Cancel / Pay Now UI) stays open while the Razorpay SDK opens its own full-screen modal on top. When the user interacts with the SDK modal and it closes (dismiss/failure), the `onDismiss` callback resets status to `pending`, revealing the drawer again with Cancel/Pay Now. The user clicks "Pay Now" again → SDK opens again → loop.

The drawer should **hide itself** once the SDK modal opens (status = `processing`) and should NOT reset to `pending` on dismiss — it should close entirely.

### Fix

**File: `src/components/payment/RazorpayCheckout.tsx`**

1. When status transitions to `processing`, visually hide the drawer content (or close the drawer) so it doesn't show behind/beneath the Razorpay SDK overlay.
2. On `onDismiss`, instead of resetting to `pending` (which shows Cancel/Pay Now again), close the drawer and call `onDismiss` prop — returning the user to the cart, not back to the payment sheet.

Specific changes:
- Close the drawer when `handlePayment` is called (set a flag or close the drawer immediately)
- In the `onDismiss` handler (line 119-128), instead of `setStatus('pending')`, call `onClose()` and the parent's `onDismiss`
- This eliminates the loop: user sees cart → clicks pay → drawer briefly shows "Processing" → SDK opens → if dismissed, user returns to cart (not back to the Cancel/Pay Now sheet)

---

## Issue 2: UI Safe Area Regression

### Root Cause

Looking at the screenshots, the Order Summary page (OrderDetailPage) uses `showHeader={false}` and has its own header. The `AppLayout` spacer div has:
```
height: max(env(safe-area-inset-top, 0px), 0px)
```

The second argument `0px` provides no minimum fallback. On some iOS WebView versions in Capacitor, `env(safe-area-inset-top)` can be evaluated but return `0` if the viewport-fit hasn't been fully initialized by the time the CSS is applied.

Additionally, pages like `SellerDetailPage` (line 253) use inline safe-area but the `AppLayout` spacer is also rendered, creating an inconsistency.

### Fix

**File: `src/components/layout/AppLayout.tsx`** (line 44)

Change the safe-area spacer minimum from `0px` to `0.75rem` to match `SafeHeader`'s behavior:
```
height: max(env(safe-area-inset-top, 0px), 0.75rem)
```

This ensures that even when `env()` returns 0 or is unsupported, there's a minimum 12px gap preventing content from touching the status bar.

---

## Files Changed

| File | Change | Risk |
|------|--------|------|
| `src/components/payment/RazorpayCheckout.tsx` | Close drawer on dismiss instead of resetting to pending; hide drawer during processing | Low — eliminates loop |
| `src/components/layout/AppLayout.tsx` | Change safe-area spacer minimum from 0px to 0.75rem | Low — additive spacing |

## Validation

1. Razorpay flow: Click Pay Now → SDK opens → dismiss SDK → user returns to cart (no loop back to Cancel/Pay Now)
2. Razorpay flow: Complete payment → success handled normally, no regression
3. All pages with `showHeader={false}`: content does not overlap status bar
4. Pages with `SafeHeader`: no double-padding regression
5. SellerDetailPage cover image: back button stays below status bar

