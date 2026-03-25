

# Razorpay Checkout — Bottom-Sheet Layout Instead of Full-Screen

## Problem
The Razorpay SDK checkout opens as a full-screen overlay that crowds the system UI (Dynamic Island/battery area). The user wants it to feel like a bottom-sheet modal — similar to the second screenshot but slightly taller.

## Technical Reality
Razorpay's Standard Checkout (`checkout.js`) always renders full-screen. There is no SDK configuration for a "bottom sheet" mode. However, since the SDK injects a wrapper `div` with an `iframe`, we can **force the wrapper to render as a bottom-sheet** using CSS — setting a top offset, max-height, and border-radius.

## Solution
Override the Razorpay wrapper styles to render as a ~85% height bottom sheet with rounded top corners, a dimmed backdrop behind it, and clear distance from the status bar.

### Files to change

**1. `src/index.css`** — Restyle the Razorpay wrapper:
- Change from `top: 0; height: 100%` to `top: auto; bottom: 0; height: 88vh; max-height: 88vh`
- Add `border-radius: 16px 16px 0 0` for the bottom-sheet look
- Replace the `::before` status-bar backdrop with a semi-transparent full-screen dimmer (`background: rgba(0,0,0,0.5)`)
- Remove the `padding-top: env(safe-area-inset-top)` (no longer needed since it doesn't reach the top)
- Keep `padding-bottom: env(safe-area-inset-bottom)` for the home indicator

**2. `src/hooks/useRazorpay.ts`** — Update `patchNode` in MutationObserver:
- Apply `bottom: 0; top: auto; height: 88vh; border-radius: 16px 16px 0 0` instead of the current full-screen styles
- Remove the `padding-top` safe-area enforcement
- Set `background-color: white` on the wrapper (Razorpay's content is white) and use the dimmer backdrop for the overlay area above
- Update the delayed sweeps to apply the same bottom-sheet styles

**3. `src/hooks/useRazorpay.ts`** — Separate backdrop vs. content container:
- Detect the backdrop div (semi-transparent overlay) and keep it full-screen with `background: rgba(0,0,0,0.4)`
- Detect the content container (has the iframe) and apply bottom-sheet positioning

### Visual result
```text
┌─────────────────────┐
│  Status bar / DI    │  ← Clear, untouched
│                     │
│  Dimmed backdrop    │  ← Semi-transparent overlay
│─────────────────────│  ← Rounded top corners (16px)
│                     │
│  Razorpay Checkout  │  ← ~88vh height
│  (iframe content)   │
│                     │
│  Continue button    │
│─────────────────────│
│  Safe area bottom   │
└─────────────────────┘
```

### Key CSS change
```css
body.razorpay-active > div[style*="z-index"]:last-of-type:not(#root) {
  top: auto !important;
  bottom: 0 !important;
  height: 88vh !important;
  max-height: 88vh !important;
  border-radius: 16px 16px 0 0 !important;
  overflow: hidden !important;
  background: #fff !important;
}
```

