

# Fix Razorpay Checkout Layout Issues in Native App

## Problem

When Razorpay checkout opens inside the native app webview (Median.js), the Razorpay overlay renders behind the device status bar. The `viewport-fit=cover` meta tag makes the webview extend edge-to-edge, but Razorpay's internal iframe/overlay does not account for safe area insets, causing:

1. The red/orange header (`#F37254` theme) bleeds into the status bar area
2. Back button and store name overlap with time/battery indicators
3. No way for the user to navigate back if they can't reach the Razorpay back button

## Root Cause

- `viewport-fit=cover` + `apple-mobile-web-app-status-bar-style=black-translucent` extends the webview behind the status bar
- Razorpay's checkout overlay (iframe) does not apply `env(safe-area-inset-top)` padding
- We cannot modify Razorpay's internal UI, but we can inject CSS that targets the Razorpay iframe container

## Fix — Two Changes

### 1. Add global CSS to pad the Razorpay overlay container (`src/index.css`)

Razorpay's checkout creates a container div with class `.razorpay-container` or a full-screen iframe. We add a CSS rule to push it below the safe area:

```css
/* Razorpay checkout safe area fix for notched devices */
.razorpay-container,
.razorpay-checkout-frame {
  top: env(safe-area-inset-top, 0px) !important;
  height: calc(100% - env(safe-area-inset-top, 0px)) !important;
}
```

### 2. Dynamically add safe-area padding when Razorpay opens (`src/hooks/useRazorpay.ts`)

Since we can't control Razorpay's iframe styling reliably via CSS alone, we apply a `padding-top` to `document.body` when the Razorpay modal opens and remove it on dismiss/completion. This pushes the entire Razorpay overlay down below the status bar:

```typescript
// Before razorpay.open()
document.body.style.setProperty('--rzp-safe-top', 'env(safe-area-inset-top, 0px)');
document.body.classList.add('razorpay-active');

// On dismiss/success/failure — remove it
document.body.classList.remove('razorpay-active');
```

And in CSS:
```css
body.razorpay-active .razorpay-container,
body.razorpay-active iframe[src*="razorpay"] {
  top: env(safe-area-inset-top, 0px) !important;
}
```

### 3. Update Razorpay theme color to match app branding

Change `theme.color` from `#F37254` (harsh red/orange) to the app's primary color `#2D4A3E` (dark green matching the app theme-color meta tag), so even if the header overlaps slightly, it blends with the status bar style.

In `src/hooks/useRazorpay.ts`, line 97:
```typescript
theme: {
  color: '#2D4A3E',  // Match app theme instead of Razorpay default orange
},
```

## Files Modified

- `src/index.css` — Add Razorpay safe area CSS rules
- `src/hooks/useRazorpay.ts` — Add/remove `razorpay-active` class on body, change theme color

