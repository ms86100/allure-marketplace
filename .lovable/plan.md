

# Fix Razorpay Checkout Overlapping iOS Dynamic Island / Status Bar

## Problem
From the screenshot: Razorpay's checkout header ("Fresh Mart Express", back arrow) renders behind the Dynamic Island and status bar, making the back button untappable. This is an App Store rejection risk.

## Root Cause
The current approach pushes the Razorpay **wrapper div** down with `top: env(safe-area-inset-top)`. However, the Razorpay SDK renders its content inside a **cross-origin iframe** — its internal layout always starts at `top: 0` within the iframe. The wrapper is shorter but the iframe content doesn't know about the safe area, so Razorpay's own header still renders at the very top of the iframe, which is now clipped or misaligned.

The fundamental issue: **you cannot style content inside a cross-origin iframe**. The wrapper offset approach doesn't work because Razorpay's internal UI doesn't adapt.

## Solution: Padding-based approach instead of top offset

Instead of pushing the wrapper down (which clips/misaligns the iframe content), we need to keep the wrapper at `top: 0` and `height: 100%` but add **padding-top** equal to the safe area. This way the iframe gets a smaller available area and Razorpay's internal layout naturally avoids the status bar region.

However, since the iframe has `position: absolute; top: 0; height: 100%` inside the wrapper, padding won't affect it. The correct approach is:

**Use a combination of keeping the wrapper full-screen but inserting a blocking element at the top** — the `::before` pseudo-element already exists but only as a backdrop. We need to make it **interactive-blocking and visually solid**, and ensure the iframe starts below it.

### Revised approach — wrapper with top offset + iframe internal offset

Since we can't control iframe internals, the only reliable approach is:

1. **Keep the wrapper at full viewport** (`top: 0, height: 100%`)
2. **Apply `padding-top: env(safe-area-inset-top)` to the wrapper** so the iframe is positioned below the safe area within the wrapper's content box
3. **Set `box-sizing: border-box`** on the wrapper so padding reduces the content area
4. **Remove the `top` offset** from the wrapper (it causes the iframe to be clipped at the bottom)
5. **Strengthen the MutationObserver** to also apply padding-top (not just top offset) and handle attribute mutations (Razorpay may modify styles after initial injection)

### Files to change

**1. `src/index.css`** — Update Razorpay safe area rules:
- Change wrapper selectors from `top: env(safe-area-inset-top)` + `height: calc(100% - safe-area)` to `top: 0` + `height: 100%` + `padding-top: env(safe-area-inset-top)` + `box-sizing: border-box`
- Keep the `::before` solid backdrop at z-index max
- Remove `position: absolute; top: 0; height: 100%` from iframe rules (let it flow with padding)

**2. `src/hooks/useRazorpay.ts`** — Update `patchNode` in MutationObserver:
- Apply `padding-top` instead of `top` offset
- Add `box-sizing: border-box`
- Also observe **attribute** mutations (not just childList) since Razorpay may re-set inline styles after injection
- Add a secondary sweep with `requestAnimationFrame` + `setTimeout(500ms)` to catch late-injected elements

**3. `src/hooks/useRazorpay.ts`** — Add `background: #2D4A3E` (matching the status bar backdrop) to the top padding area of the wrapper so the safe area region has a solid color behind it, not transparent

### Technical detail

```css
/* Wrapper: full viewport with top padding */
body.razorpay-active > div[style*="z-index"],
... {
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  height: 100% !important;
  width: 100% !important;
  padding-top: env(safe-area-inset-top, 0px) !important;
  box-sizing: border-box !important;
  background-color: #2D4A3E !important; /* matches status bar */
}

/* iframe fills the padded content area */
body.razorpay-active iframe[src*="razorpay"] {
  width: 100% !important;
  height: 100% !important;
  border: none !important;
}
```

```typescript
// In patchNode:
node.style.setProperty('padding-top', 'env(safe-area-inset-top, 0px)', 'important');
node.style.setProperty('box-sizing', 'border-box', 'important');
node.style.setProperty('top', '0', 'important');
node.style.setProperty('height', '100%', 'important');
node.style.setProperty('background-color', '#2D4A3E', 'important');
```

MutationObserver config update:
```typescript
razorpayDomObserver.observe(document.body, { 
  childList: true, 
  subtree: true, 
  attributes: true, 
  attributeFilter: ['style'] 
});
```

Plus delayed re-sweeps at 100ms, 500ms, and 1000ms after `razorpay.open()` to catch late DOM injections.

