

# Fix: Toast Overlapping Status Bar + Double Safe-Area Padding on Checkout

## Issues Found

### Issue 1: Toast notifications overlap iOS status bar (Screenshot 2)
The Radix `ToastViewport` in `src/components/ui/toast.tsx` uses `fixed top-0 z-[100]` — toasts appear at the very top of the viewport with zero safe-area padding. The "Cash on Delivery" toast slides in behind the clock/battery area.

### Issue 2: Double safe-area padding on Checkout page (Screenshot 2)
The checkout page's sticky header uses the `safe-top` CSS class which adds `padding-top: env(safe-area-inset-top)`. But `#root` already applies `padding-top: env(safe-area-inset-top)`. This creates double padding — explaining the large gap between the status bar and the "Checkout" title.

### Issue 3: Excessive top gap on Category page (Screenshot 1)
Similarly, `CategoryGroupPage` renders inside `AppLayout` which renders `Header`. The Header's `sticky top-0` positioning starts below `#root`'s safe-area padding, but any additional safe-area handling inside would double it. The gap visible in screenshot 1 is mostly the `#root` padding working correctly, but it looks excessive because the Header has its own padding.

## Plan

### Step 1: Fix ToastViewport safe-area (`src/components/ui/toast.tsx`)

Add safe-area padding to the Radix ToastViewport so toasts never overlap the status bar:

```
// Line 17, change:
"fixed top-0 z-[100] flex max-h-screen w-full ..."
// To:
"fixed top-0 z-[100] flex max-h-screen w-full pt-[env(safe-area-inset-top,0px)] ..."
```

### Step 2: Remove `safe-top` from checkout header (`src/pages/CartPage.tsx`)

The `#root` already provides `padding-top: env(safe-area-inset-top)`. Pages that use `showHeader={false}` and implement their own sticky header should NOT add `safe-top` again.

Line 95 — remove `safe-top` from the className:
```
// Before:
"sticky top-0 z-30 bg-background border-b border-border px-4 py-3.5 safe-top flex items-center gap-3"
// After:
"sticky top-0 z-30 bg-background border-b border-border px-4 py-3.5 flex items-center gap-3"
```

### Step 3: Audit other `safe-top` usages

Search for other pages using `safe-top` that might have the same double-padding issue. Based on the search results, `safe-top` is only used in CartPage.tsx. Other pages that handle safe-area directly (SellerDetailPage, SetStoreLocationSheet, OnboardingLocationSheet) use `position: fixed` which is correct since fixed elements are outside the normal flow and don't benefit from `#root`'s padding.

## Summary

| File | Change |
|---|---|
| `src/components/ui/toast.tsx` | Add `pt-[env(safe-area-inset-top)]` to ToastViewport |
| `src/pages/CartPage.tsx` | Remove `safe-top` class from sticky header (line 95) |

2 files, ~2 lines changed each. Fixes toast overlap and double padding.

