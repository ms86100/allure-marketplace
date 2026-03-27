

# Fix Header Safe-Area Gap on Mobile

## Problem

There's a visible gap between the device status bar and the header on notched iPhones. This happens because of a double safe-area offset:

1. `#root` has `padding-top: env(safe-area-inset-top, 0px)` — pushes all content down
2. `#root::before` is a fixed overlay with `height: env(safe-area-inset-top)` filling that same gap with background color
3. The header uses `sticky top-0` — it sticks to the top of the padded container, not the screen edge

The result: the safe-area zone shows the `#root::before` background, then the header starts below it, creating a visible gap that doesn't match how native apps handle the notch area.

## Solution

Remove the safe-area padding from `#root` and instead let the **header itself** extend into the safe area with internal padding. This is the standard pattern used by native-feeling PWAs.

### Changes

**`src/index.css`** (lines 249-270):
- Remove `padding-top: env(safe-area-inset-top, 0px)` from `#root`
- Keep `#root::before` but change it to match the header background color variable instead of generic background (so the status bar area blends with the header)

**`src/components/layout/Header.tsx`** (line 95):
- Change the inner `div` padding from `pt-3` to `pt-[max(env(safe-area-inset-top,0px),0.75rem)]` — this makes the header content start below the notch, while the header background extends to the screen edge

**`src/components/layout/Header.tsx`** (line 92):
- Change `sticky top-0` to `sticky top-0` (stays the same) — but now without `#root`'s padding-top, the header will sit at the true top of the viewport

This approach means:
- The header background color fills the status bar area seamlessly
- Header content (logo, buttons) sits below the notch
- No double gap on any device
- Works on non-notched devices too (safe-area-inset-top = 0px, falls back to 0.75rem)

| File | Change |
|------|--------|
| `src/index.css` | Remove `padding-top: env(safe-area-inset-top)` from `#root`; update `#root::before` to use header-bg color |
| `src/components/layout/Header.tsx` | Add safe-area padding to header's inner div: `pt-[max(env(safe-area-inset-top,0px),0.75rem)]` |

