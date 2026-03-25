

# Fix Razorpay Checkout Overlapping iOS Status Bar

## Problem
The Razorpay SDK iframe renders full-viewport, causing its header (back arrow, title) to collide with the iOS status bar (time, battery, Wi-Fi). The back button becomes untappable — an App Store rejection risk.

## Root Cause
The CSS selectors targeting Razorpay's injected DOM (`div[style*="z-index"]`, `.razorpay-container`, etc.) are not matching the actual elements Razorpay injects in the Capacitor WebView. The `env(safe-area-inset-top)` offset isn't being applied, so the iframe starts at `top: 0`.

## Plan

### 1. Strengthen CSS selectors to catch Razorpay's overlay (`src/index.css`)

Razorpay injects its overlay as a direct child of `<body>` with inline styles. The current selectors are too specific and may miss the actual container. We'll add broader selectors:

- Target `body.razorpay-active > .razorpay-backdrop` and `body.razorpay-active > div:last-of-type` as fallback catches for the SDK overlay
- Apply `top: env(safe-area-inset-top) !important` and `height: calc(100% - env(safe-area-inset-top)) !important` to all matched elements
- Also target the backdrop/overlay div to push it down

### 2. Use JavaScript to forcibly patch Razorpay's DOM (`src/hooks/useRazorpay.ts`)

Since CSS-only approaches are unreliable against dynamically injected iframes with high z-index inline styles, add a MutationObserver after `razorpay.open()`:

- Watch `document.body` for added child nodes
- When a new `div` with high z-index or an iframe with `razorpay` in its `src` appears, forcibly set `style.top = env(safe-area-inset-top)` and adjust height
- Disconnect the observer on payment completion/dismiss
- This guarantees the offset regardless of what selectors Razorpay uses

### 3. Update the `::before` backdrop to be more robust

- Ensure the green status bar backdrop (`#2D4A3E`) renders above the Razorpay overlay by verifying z-index layering
- Add `!important` to all properties on the `::before` pseudo-element

## Technical Details

**MutationObserver approach** (in `useRazorpay.ts`, after `razorpay.open()`):
```typescript
const safeTop = getComputedStyle(document.documentElement)
  .getPropertyValue('--sat') || '0px'; // fallback

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node instanceof HTMLElement) {
        const zIndex = parseInt(node.style.zIndex || '0', 10);
        if (zIndex > 999 || node.querySelector('iframe[src*="razorpay"]')) {
          node.style.setProperty('top', 'env(safe-area-inset-top, 0px)', 'important');
          node.style.setProperty('height', 'calc(100% - env(safe-area-inset-top, 0px))', 'important');
        }
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

Store the observer ref and disconnect it in `unlockBodyScroll()` and the dismiss/success handlers.

