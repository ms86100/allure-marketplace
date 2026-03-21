

# Razorpay Checkout Responsiveness & Mobile UX Audit

## Understanding the Problem

The screenshot shows Razorpay's **native checkout popup** (Payment Options: UPI, Cards, Netbanking, Wallet). This is a **third-party iframe** hosted by Razorpay — we cannot directly style its internal content. However, we control:

1. **How the iframe is sized and positioned** (CSS in `index.css`)
2. **Our pre-checkout drawer** (`RazorpayCheckout.tsx`) that shows before the Razorpay popup opens
3. **Body scroll locking** during the popup (`useRazorpay.ts`)

The "not responsive" issue likely means the Razorpay popup doesn't properly fill the screen or has interaction issues on certain devices.

---

## Findings from Code Audit

### A. Razorpay Iframe CSS Issues (index.css lines 490-527)

**Problem 1:** The CSS targets `iframe[src*="razorpay"]` and `iframe[src*="api.razorpay"]`, but Razorpay also creates iframes from `checkout.razorpay.com` — the selector may miss some.

**Problem 2:** The `.razorpay-container` class is assumed to exist on Razorpay's DOM, but Razorpay's actual wrapper classes change across SDK versions. The CSS should target Razorpay's actual DOM structure more broadly.

**Problem 3:** No `max-width` constraint — on tablets/desktop, the Razorpay popup stretches edge-to-edge which looks broken.

### B. RazorpayCheckout.tsx (Our Pre-Checkout Drawer)

**Problem 4:** The drawer doesn't use `max-h-[85vh]` (the standard from memory notes), so on small screens the drawer content could overflow.

**Problem 5:** The drawer has no safe-area bottom padding — buttons could be hidden behind the gesture bar on iPhone X+ models.

**Problem 6:** DrawerTitle says "Pay with UPI" even when Razorpay supports Cards, Wallets, Netbanking — misleading.

### C. useRazorpay.ts Body Lock

**Problem 7:** The `position: fixed` body lock doesn't set `top` to the negative scroll position, causing the page to jump to top when the popup opens. The code saves `scrollY` to `dataset` but never applies `-top` to body.

### D. PaymentMethodSelector.tsx

**Problem 8:** Card touch targets are fine (full-width buttons), but the disabled state text "Not available for this seller" could wrap poorly on narrow screens.

---

## Plan

### 1. Fix Razorpay iframe CSS (index.css)
- Broaden iframe selectors to catch all Razorpay-sourced iframes: `iframe[src*="checkout.razorpay"]`, `iframe[src*="api.razorpay"]`, `iframe[src*="razorpay.com"]`
- Add a catch-all for Razorpay's backdrop/overlay divs using attribute selectors
- Ensure the iframe uses `100dvh` on mobile and is properly centered with max-width on larger screens
- Add `touch-action: auto` to prevent gesture conflicts inside the iframe

### 2. Fix body scroll lock in useRazorpay.ts
- Apply `top: -${scrollY}px` to body when adding `razorpay-active` class, so the page doesn't visually jump
- This is already partially implemented (saves scrollY) but the `top` style is never set before `razorpay.open()`

### 3. Improve RazorpayCheckout.tsx drawer
- Add `max-h-[85vh]` and `overflow-y-auto` to drawer content
- Add safe-area bottom padding: `pb-[env(safe-area-inset-bottom)]`
- Fix misleading "Pay with UPI" title → "Pay Online" when Razorpay mode is active
- Add minimum touch target sizes (already fine — buttons use shadcn defaults)

### 4. Fix PaymentMethodSelector text wrapping
- Add `min-w-0` to text container to prevent overflow on narrow screens

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Broaden Razorpay iframe selectors, add touch-action, fix max-width for tablets |
| `src/hooks/useRazorpay.ts` | Fix body scroll lock to set `top: -scrollY` before opening popup |
| `src/components/payment/RazorpayCheckout.tsx` | Add safe-area padding, max-height, fix "Pay with UPI" title, responsive adjustments |
| `src/components/payment/PaymentMethodSelector.tsx` | Add `min-w-0` for text truncation safety |

