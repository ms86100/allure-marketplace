

# Compact Visibility Checklist Redesign

## Problem
The visibility checklist currently expands to show every check item as a full card with background, padding, and description text — consuming 400-500px of vertical space. This pushes the tab navigation and all operational content far below the fold.

## Solution
Replace the expanded card list with a **compact progress bar + summary row** that shows only issues. Full details accessible via a slide-up sheet (Vaul drawer).

### Layout (collapsed — default state)

```text
┌──────────────────────────────────────────┐
│ 🛡 Store Health    7/9 passed    [View]  │
│ ████████████████░░░░  78%                │
│ ⚠ 2 issues: No logo · Location missing  │
└──────────────────────────────────────────┘
```

- Single card, ~80px tall max
- Progress bar showing pass ratio across ALL checks (not just critical)
- One-line summary of issues (fail/warn items only), comma-separated labels
- If fully healthy: green bar, "All checks passed" — no issue line
- "View" button opens a Drawer with the full grouped checklist (same CheckGroup/CheckItem components, unchanged)

### Drawer (on tap)
Full existing checklist inside a `Drawer` (vaul) — grouped by critical/products/discovery/quality with all action links preserved. No information lost.

## File Changes

**`src/components/seller/SellerVisibilityChecklist.tsx`** — Rewrite the render:
- Default: compact card with `Progress` bar, issue count, one-line issue summary
- Replace `expanded` toggle with Drawer open/close
- Move the grouped `CheckGroup` rendering inside `<DrawerContent>`
- Keep all existing sub-components (`CheckItem`, `CheckGroup`, `STATUS_CONFIG`, `GROUP_CONFIG`) unchanged
- Import `Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger` from vaul
- Import `Progress` from ui/progress
- Remove `AnimatePresence`/`motion` (no longer needed for expand/collapse)

**No other files changed.** The hook, the dashboard page, and all other components remain untouched.

