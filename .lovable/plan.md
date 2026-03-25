

# Production Stabilization Audit — Root Cause Report & Fix Plan

## Audit Summary

After a thorough review of 20+ files across navigation, Live Activity, notifications, safe-area handling, and order flows, I identified **3 real bugs** and **1 systemic issue** causing the reported regressions. The architecture is fundamentally sound — the issues are localized.

---

## Issue 1: Double Safe-Area Padding on 12+ Pages (HIGH — Visible Regression)

**Root Cause**: When the `#root::before` backdrop and `#root { padding-top: env(safe-area-inset-top) }` were added, only `CartPage.tsx` had its `.safe-top` class removed. **12 other pages** still apply `.safe-top`, creating double padding (the gap users see in screenshots).

**Affected pages** (all use `showHeader={false}` with custom sticky headers that add `safe-top`):
- `OrderDetailPage.tsx` (line 224)
- `FavoritesPage.tsx` (line 61)
- `CategoriesPage.tsx` (line 189)
- `CategoryGroupPage.tsx` (line 211)
- `SearchPage.tsx` (line 73)
- `NotificationsPage.tsx` (line 157)
- `SocietyDashboardPage.tsx` (line 228)
- `HelpPage.tsx` (line 110)
- `BecomeSellerPage.tsx` (lines 163, 191, 254)
- `SellerProductsPage.tsx` (line 37)
- `OrderProgressOverlay.tsx` (line 70)
- `OnboardingWalkthrough` (if applicable)

**Fix**: Remove `safe-top` from all these pages. The `#root` already provides the padding globally. Pages with `position: fixed` elements (like `SellerDetailPage`) are correctly handled and should keep their inline safe-area logic.

---

## Issue 2: Navigation Trap from Deep Links / Live Activity (HIGH — User Lock)

**Root Cause**: When a user taps a Live Activity card or push notification, the app navigates to `/orders/{id}` with `state: { from: 'deeplink' }`. The back button correctly navigates to `/orders` in this case. However, the **BottomNav is hidden** when `hasSellerActionBar` is true (line 221: `showNav={!hasSellerActionBar}`). If the seller views their own order via deep link, they have NO navigation escape — no bottom nav, and back goes to `/orders` which may not be in the history stack on cold start.

Additionally, `navigate(-1)` on the non-deeplink path fails on cold start (no history) — the user stays on the same page.

**Fix**: 
1. In `OrderDetailPage.tsx` line 225, change the back button to always have a fallback:
```
onClick={() => {
  if (location.state?.from === 'deeplink' || window.history.length <= 2) {
    navigate('/orders');
  } else {
    navigate(-1);
  }
}}
```
2. Always show bottom nav for buyers (line 221): `showNav={!hasSellerActionBar || !o.isSellerView}` — buyers should never lose bottom nav.

---

## Issue 3: OrderDetailPage has `safe-top` causing double padding (subsumed by Issue 1)

The Order Summary header at line 224 uses `safe-top`, creating the excessive gap seen in the Checkout screenshot. This is the same root cause as Issue 1.

---

## Issue 4: Stale `lastProcessedEvents` Map in LiveActivity Orchestrator (LOW — Memory Leak)

**Root Cause**: The `lastProcessedEvents` Map (line 16 of `useLiveActivityOrchestrator.ts`) is module-level and never cleaned up. Over a long session with many orders, it accumulates entries indefinitely. While not causing visible bugs now, it's a time bomb for long-running sessions.

**Fix**: Clear entries when orders become terminal (add cleanup in the terminal handler at line 113):
```ts
lastProcessedEvents.delete(orderId);
```

---

## What is NOT Broken (Audit Confirmation)

- **Live Activity dedup**: Composite key (`orderId:status:updated_at`) correctly prevents duplicate processing. Only one card per order.
- **Notification spam**: The partial unique index fix from earlier correctly prevents duplicate proximity notifications at the DB level.
- **State derivation**: All order states are DB-driven via `category_status_flows`. No hardcoded states found.
- **Realtime + polling**: Triple-channel reliability (realtime, 15s polling, visibility sync) ensures state convergence.
- **Cart/checkout**: Idempotency keys, advisory locks, and the submit guard prevent duplicate orders.
- **Deep link dedup**: `sessionStorage` flag prevents re-processing of launch URLs.

---

## Implementation Plan

### Step 1: Remove `safe-top` from all pages (12 files, ~15 line changes)

Remove the `safe-top` class from every page that renders inside `#root` (which already handles safe-area padding). Keep it only on `position: fixed` overlays that sit outside the normal flow.

### Step 2: Fix navigation trap in OrderDetailPage (1 file, 2 changes)

- Back button: add `window.history.length <= 2` fallback to `/orders`
- Bottom nav: always show for buyer view

### Step 3: Clean up stale LiveActivity dedup map (1 file, 1 line)

Delete terminal order entries from `lastProcessedEvents`.

### Step 4: Verify no other `safe-top` usages conflict

The `OnboardingWalkthrough` and fixed-position overlays using `safe-top` are correct because they use `position: fixed` and aren't children of `#root`'s padding context.

---

## Summary Table

| # | Issue | Root Cause | Files | Lines Changed |
|---|---|---|---|---|
| 1 | Double safe-area padding | `safe-top` not removed after global fix | 12 files | ~15 |
| 2 | Navigation trap on cold start/deep link | `navigate(-1)` with no history + hidden bottom nav | OrderDetailPage.tsx | 2 |
| 3 | Memory leak in LA dedup map | Never cleaned up | useLiveActivityOrchestrator.ts | 1 |

**Total**: ~13 files, ~18 lines changed. All surgical. Zero risk to existing functionality.

