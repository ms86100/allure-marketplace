

## Fix: Razorpay Checkout Header Overlapping iOS Status Bar

### Problem
The screenshot shows Razorpay's header (back arrow + "Fresh Mart Express") colliding with the iOS status bar (time, battery). Despite existing CSS rules that set `top: env(safe-area-inset-top)` on iframe selectors, the Razorpay overlay still renders behind the status bar on notched iPhones.

### Root Cause
The current CSS targets specific selectors like `iframe[src*="razorpay"]` and `.razorpay-container`, but Razorpay's SDK dynamically injects a wrapper `<div>` directly on `<body>` with inline `position: fixed; top: 0` styles. This wrapper div is the actual visual container — the iframe inherits position from it. Our CSS pushes the iframe down but not the wrapper, and Razorpay's inline `top: 0` overrides our rules on the wrapper.

### Fix — `src/index.css`

Replace the current Razorpay safe-area CSS block with a more aggressive approach:

1. **Target the Razorpay wrapper div** — `body.razorpay-active > div[style*="z-index"]` needs `top: env(safe-area-inset-top) !important` and `height: calc(100% - env(safe-area-inset-top)) !important` to push the entire overlay below the status bar
2. **Also target `.razorpay-checkout-frame`** — Razorpay's standard frame class — with the same inset
3. **Keep the solid backdrop `::before`** unchanged (it fills the status bar area with the theme color)
4. **Add bottom safe-area** to the wrapper div to prevent the "Continue" button from being hidden behind the home indicator

Key CSS changes:
```css
/* Push the entire Razorpay overlay below status bar */
body.razorpay-active > div[style*="z-index"],
body.razorpay-active > div[style*="position: fixed"],
body.razorpay-active .razorpay-checkout-frame {
  top: env(safe-area-inset-top, 0px) !important;
  height: calc(100% - env(safe-area-inset-top, 0px)) !important;
  bottom: auto !important;
}

/* iframe inside the wrapper — fill the wrapper, not the viewport */
body.razorpay-active iframe[src*="razorpay"],
body.razorpay-active iframe[src*="api.razorpay"],
body.razorpay-active iframe[src*="checkout.razorpay"] {
  position: absolute !important;  /* relative to the wrapper, not viewport */
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  border: none !important;
}
```

### Files Changed
| File | Change |
|---|---|
| `src/index.css` | Rewrite Razorpay safe-area CSS to target wrapper divs, not just iframes |

~20 lines changed in 1 file. Run `npx cap sync` after to apply.

