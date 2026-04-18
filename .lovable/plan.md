
## Make "Add Product" always reachable on mobile

### Problem
On `/seller/products`, the "Add Product" button lives in the top header row. On mobile, once the seller scrolls down the product list, the button scrolls off-screen and there is no way to add a product without scrolling all the way back up.

### Approach
Add a **mobile-only Floating Action Button (FAB)** for "Add Product" on `SellerProductsPage`, while keeping the existing top button for desktop/tablet. This is the lowest-risk, mobile-first standard pattern and avoids restructuring the existing header.

### Changes

**1. `src/pages/SellerProductsPage.tsx`**
- Keep the current top-row "Add Product" button as-is for `md+` screens (already shown there).
- Hide the top "Add Product" button on mobile (`md:inline-flex`) so we don't duplicate the CTA.
- Add a new FAB rendered only on mobile (`md:hidden`):
  - Fixed position, bottom-right, above the bottom tab bar (`AppLayout` bottom nav is ~64px tall → use `bottom-20` for safe clearance, plus `pb-[env(safe-area-inset-bottom)]` wrapper for iOS notch).
  - Right offset `right-4`.
  - `z-40` (below modals/toasts which are typically z-50+).
  - Rounded-full, primary color, shadow-lg, icon + "Add Product" label, ~h-14.
  - Same `onClick={() => navigate('/seller/products/new')}` handler.
  - `aria-label="Add Product"` for a11y.
- Hide the FAB when blocking states are active so it doesn't mislead:
  - Hide if `sp.licenseBlocked?.blocked` is true (seller cannot add anyway).

### Layout sketch
```text
┌─────────────────────────┐
│ ← Header                │  ← top bar still has Add (desktop only)
│ Seller card             │
│ Product list ...        │
│ Product list ...        │
│                ┌──────┐ │
│                │ + Add│ │  ← FAB (mobile only, fixed)
│                └──────┘ │
├─────────────────────────┤
│ Home Orders Cart ...    │  ← bottom nav (AppLayout)
└─────────────────────────┘
```

### Why FAB (not sticky header)
- Sticky header would compete with `AppLayout` header/scroll behavior and existing seller-info card.
- FAB is the established mobile pattern for "create new" actions, and matches what sellers expect.
- Zero impact on desktop where the inline button already works fine.

### Verification checklist
- Mobile (≤768px): FAB visible at all scroll positions, does not overlap bottom nav, tappable.
- Desktop (≥768px): No FAB; existing inline "Add Product" + "Bulk Add" buttons unchanged.
- License-blocked seller: FAB hidden (consistent with restricted state).
- Delete dialog still works (FAB z-index below dialog).
- Safe-area inset respected on iOS (TestFlight screenshots provided).

### Out of scope
- No changes to other seller pages (only `/seller/products` was reported).
- No restructuring of header or bulk-upload flow.
