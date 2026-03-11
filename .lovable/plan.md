

# Seller Dashboard Reorganization: Tab-Based Navigation

## Problem

The seller dashboard stacks 12+ sections on a single scrolling page. On mobile (the primary form factor), sellers must scroll through store status, visibility checklist, booking stats, agenda, performance metrics, earnings, order stats, quick actions, coupons, analytics, demand insights, and orders — all on one page.

## Approach

Replace the single scrolling page with a **sticky horizontal tab bar** below the store status card. Four tabs, each containing logically grouped modules. This is mobile-native (matches the existing bottom nav pattern) and keeps everything within one tap.

```text
┌─────────────────────────────────┐
│  Store Status Card + Toggle     │  ← Always visible
│  Visibility Checklist (if gaps) │  ← Always visible (collapses when complete)
├─────────────────────────────────┤
│ [Orders] [Schedule] [Tools] [Stats] │  ← Sticky tab bar
├─────────────────────────────────┤
│                                 │
│   Tab content below             │
│                                 │
└─────────────────────────────────┘
```

### Tab 1: Orders (default)
- Availability prompt banner
- Order count stats (DashboardStats — 4 cards)
- Order filters + order list with infinite scroll
- New order alert overlay

### Tab 2: Schedule
- Service booking stats
- Day agenda

### Tab 3: Tools
- Quick actions (Manage Products, Store Settings, Add Business)
- Coupon manager

### Tab 4: Stats
- Store performance card (rating, response time, fulfillment, cancellation)
- Earnings summary
- Seller analytics
- Demand insights

## What stays always visible (above tabs)
- StoreStatusCard with availability toggle
- SellerVisibilityChecklist (it's a setup guide, not a daily tool)
- NewOrderAlertOverlay (it's a modal overlay, not a section)

## Implementation

### Files changed

**`src/pages/SellerDashboardPage.tsx`** — Major restructure:
- Add `activeTab` state with 4 values: `'orders' | 'schedule' | 'tools' | 'stats'`
- Render a sticky tab bar using Shadcn `Tabs` component
- Move each section group into its respective tab panel
- All existing component imports and data-fetching remain identical
- No components deleted, no props changed

**No new files created. No files deleted. No component APIs changed.**

### Tab bar design
- Uses `@radix-ui/react-tabs` (already installed via Shadcn)
- Sticky positioned below the always-visible header content
- Each tab shows an icon + label (matching the memory note: Orders, Schedule, Tools, Stats)
- Active tab gets primary color indicator
- Horizontal scroll if needed on very small screens

### What does NOT change
- All seller component files remain untouched
- All hooks and queries remain untouched
- All routes remain the same (`/seller`, `/seller/products`, `/seller/settings`, `/seller/earnings`)
- AppLayout wrapper stays the same
- Loading/error/empty states stay the same

