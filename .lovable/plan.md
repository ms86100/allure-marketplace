

# System-Level Safe-Area Header Fix — Bulletproof for iOS + Android

## Problem
15+ pages use `showHeader={false}` and render custom `sticky top-0` headers that sit behind the device status bar. The current `#root::before` pseudo-element only paints a color over the status bar zone — it doesn't structurally push content below it. Only CartPage has a manual `pt-[max(env(safe-area-inset-top))]` fix; all others are broken.

## Architecture Decision

The user is right that padding `<main>` alone is fragile. The correct fix is:

1. **Create a shared `SafeHeader` component** that all custom headers use
2. **Update `AppLayout`** to provide a safe-area spacer when header is hidden
3. **Fix sticky positioning** to account for the safe-area inset
4. **Keep the `#root::before`** — it serves a real purpose (painting the status bar background color), but stop relying on it as the only protection

## Changes

### 1. New: `src/components/layout/SafeHeader.tsx`

A reusable wrapper for all custom sticky headers that:
- Applies `pt-[max(env(safe-area-inset-top,0px),0.75rem)]` to its own container
- Uses `sticky top-0 z-30` positioning
- Provides the standard background/border styling
- Accepts `className` for per-page customization

```tsx
// Simplified API:
<SafeHeader>
  <BackButton />
  <h1>Page Title</h1>
</SafeHeader>
```

This replaces every inline `<div className="sticky top-0 z-30 bg-background ...">` across all pages with a single component that handles safe-area correctly.

### 2. Update: `src/components/layout/AppLayout.tsx`

Add a safe-area spacer `<div>` when `showHeader={false}`:

```tsx
{!showHeader && (
  <div 
    className="sticky top-0 z-30 bg-background" 
    style={{ height: 'env(safe-area-inset-top, 0px)', minHeight: 0 }} 
  />
)}
```

This ensures even pages that DON'T use `SafeHeader` still have the inset reserved. But ideally all pages migrate to `SafeHeader`.

### 3. Update all 13 affected pages

Replace each inline sticky header div with `<SafeHeader>`:

| Page | Current Pattern | Fix |
|------|----------------|-----|
| FavoritesPage | `sticky top-0 z-30 ... py-3.5` | `<SafeHeader>` |
| NotificationsPage | `sticky top-0 z-30 ... py-3.5` | `<SafeHeader>` |
| OrderDetailPage | `sticky top-0 z-30 ... py-3.5` | `<SafeHeader>` |
| HelpPage | `sticky top-0 z-30 ... py-3.5` | `<SafeHeader>` |
| SearchPage | `sticky top-0 z-40 ...` | `<SafeHeader>` |
| CategoriesPage | `sticky top-0 z-40 ...` | `<SafeHeader>` |
| CategoryGroupPage | `sticky top-0 z-30 ...` | `<SafeHeader>` |
| SocietyDashboardPage | `sticky top-0 z-40 ...` | `<SafeHeader>` |
| AdminPage | `sticky top-0 z-30 ...` | `<SafeHeader>` |
| SellerSettingsPage | inline back button, no sticky header | Wrap in `<SafeHeader>` |
| SellerEarningsPage | inline back button | Wrap in `<SafeHeader>` |
| BecomeSellerPage | inline back button | Wrap in `<SafeHeader>` |
| TestResultsPage | `sticky top-0 z-10 ...` | `<SafeHeader>` |
| CartPage | Already has safe-area `pt-[max(...)]` | Migrate to `<SafeHeader>` for consistency |

### 4. Keep `#root::before` but make it non-structural

The pseudo-element stays — it paints the status bar zone with the correct theme color. But it is NOT the layout mechanism. `SafeHeader`'s padding is the structural fix. The pseudo-element is purely cosmetic insurance.

### 5. Android fallback

`SafeHeader` uses `pt-[max(env(safe-area-inset-top,0px),0.75rem)]` — the `0.75rem` minimum ensures Android devices that return `0` for `env()` still get usable spacing. This is the same pattern the built-in `Header` already uses successfully.

## Why this is bulletproof

- **Single component** — new pages automatically get safe-area handling by using `<SafeHeader>`
- **No page-level padding hacks** — the header itself owns its positioning
- **Sticky works correctly** — header sticks to viewport top, safe-area padding is inside it
- **iOS + Android** — `max(env(), fallback)` handles both platforms
- **No regression on home page** — home uses `showHeader={true}` → existing `Header` component, untouched
- **Pseudo-element kept** — cosmetic layer for status bar color, not structural

## Technical Detail

```text
Before (broken on 13+ pages):
┌──────────────────┐
│   STATUS BAR     │  ← #root::before paints color
│← Back  Title     │  ← hidden behind status bar (sticky top-0)
│   Page content   │
└──────────────────┘

After (SafeHeader):
┌──────────────────┐
│   STATUS BAR     │  ← #root::before paints color
│  ┌────────────┐  │  ← SafeHeader padding pushes content below
│  │← Back Title│  │  ← always visible
│  └────────────┘  │
│   Page content   │
└──────────────────┘
```

## Files Summary

| File | Action |
|------|--------|
| `src/components/layout/SafeHeader.tsx` | **New** — shared safe-area header component |
| `src/components/layout/AppLayout.tsx` | Add fallback spacer for pages without any header |
| 13 page files | Replace inline sticky headers with `<SafeHeader>` |

