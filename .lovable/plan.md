

# Mobile Responsiveness & Safe Area Fix

## Problem Analysis

After reading the codebase, three root causes explain the issues you're seeing on real devices:

1. **Status bar overlap**: The header uses `sticky top-0` with content padding `pt-[max(0.75rem,env(safe-area-inset-top))]`, but the header background itself starts at `top:0` — meaning the backdrop color doesn't extend behind the status bar. Combined with `apple-mobile-web-app-status-bar-style: black-translucent` in `index.html`, app content renders underneath the clock/battery area.

2. **Society name truncation**: The location pill constrains text to `max-w-[40vw]` on mobile, which cuts off long society names. The right-side icon bar (`gap-0.5`) packs up to 6 icons (theme toggle, builder, admin, seller, bell, profile avatar), leaving almost no space for the location text.

3. **Landing page has zero safe-area handling**: `LandingNav` uses a plain `h-16` sticky nav with no safe-area-inset-top padding.

## Plan

### Step 1: Fix status bar overlap globally

**File: `src/index.css`** — Add a global rule that pushes content below the status bar notch area:

```css
/* Ensure the app root respects the status bar inset */
#root {
  padding-top: env(safe-area-inset-top, 0px);
}
```

This single rule ensures ALL pages (landing, home, auth, etc.) start below the status bar, without needing per-component safe-area hacks.

**File: `src/components/layout/Header.tsx`** — Remove the `env(safe-area-inset-top)` from the inner padding (since the root now handles it):

Change `pt-[max(0.75rem,env(safe-area-inset-top))]` → `pt-3`

### Step 2: Fix society name truncation in header

**File: `src/components/layout/Header.tsx`**:

- Widen the location pill text from `max-w-[40vw]` to `max-w-[55vw]` on small screens and `max-w-[50vw]` on 375px+
- Reduce right icon bar: hide theme toggle on screens < 400px (it's already hidden below 375px, but that breakpoint is too small)
- Reduce icon sizes from `h-9 w-9` to `h-8 w-8` for tighter fit

### Step 3: Fix landing page safe area

**File: `src/components/landing/LandingNav.tsx`**:

- The `#root` padding-top from Step 1 handles this automatically. No additional changes needed.

### Step 4: Fix other full-screen overlays

**Files**: `SellerDetailPage.tsx`, `SetStoreLocationSheet.tsx`, `OnboardingLocationSheet.tsx`

- These use their own `env(safe-area-inset-top)` positioning. Since we're now applying the inset at `#root` level, we need to verify these full-screen overlays (which use `fixed inset-0`) still account for the status bar. Fixed-position elements are NOT children of normal flow, so they still need their own `env(safe-area-inset-top)`. No changes needed for these — they're already correct.

### Step 5: Ensure home page content isn't cut off

**File: `src/components/layout/AppLayout.tsx`**:

- The `pb-24` on main is correct (space for bottom nav + cart bar)
- No changes needed here

## Summary of changes

| File | Change |
|---|---|
| `src/index.css` | Add `#root { padding-top: env(safe-area-inset-top) }` |
| `src/components/layout/Header.tsx` | Remove safe-area from inner padding (now handled by root), widen location pill text, tighten icon sizes |
| Other overlay components | No changes needed (they use `position: fixed` with their own safe-area handling) |

Total: 2 files changed, ~10 lines modified.

