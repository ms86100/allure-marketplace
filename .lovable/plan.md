

# Fix: Content Bleeding Into Status Bar on iOS

## Problem

The screenshot shows the featured banner carousel bleeding into the iOS status bar area (time "1:53", "TestFlight" text visible over the banner). The current approach uses `padding-top: env(safe-area-inset-top)` on `#root`, but since `#root` has `overflow-y: auto`, when content scrolls, it becomes visible through the transparent status bar gap.

The padding just pushes content down initially — it doesn't create an opaque barrier. Scrolled content rises into the safe-area gap.

## Fix

### 1. Add a fixed opaque status bar backdrop (`src/index.css`)

Add a `::before` pseudo-element on `#root` that creates a solid, fixed background behind the status bar — matching the app's background color:

```css
#root::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top, 0px);
  background: hsl(var(--background));
  z-index: 9999;
  pointer-events: none;
}
```

This ensures nothing can ever show through the status bar area, regardless of scroll position. The pseudo-element inherits the theme's background color, so it works in both light and dark mode.

### 2. Keep existing `padding-top` on `#root`

The `padding-top: env(safe-area-inset-top)` stays — it correctly offsets content so it starts below the status bar. The new `::before` just adds an opaque shield on top.

### 3. Society name truncation

The location pill text max-width was recently set to `max-w-[48vw]` — the screenshot shows "Shriram Greenfield Phase-2 M..." which is just CSS truncation working correctly for a very long name. This is acceptable behavior. No change needed.

## Summary

| File | Change |
|---|---|
| `src/index.css` | Add `#root::before` fixed pseudo-element as opaque status bar shield (~8 lines) |

1 file, ~8 lines added. Zero risk to existing layout — purely additive.

