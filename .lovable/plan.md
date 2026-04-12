

# Performance Hardening: Consistent Cache & Fetch Policies Across All Hooks

## Problem
While key hooks (cart, seller orders) were recently optimized, many other hooks across the app still have aggressive staleTime (0–30s), unnecessary `refetchOnMount: 'always'`, and frequent `refetchInterval` polling. These cause redundant network requests on every navigation, especially after idle.

## What Changes

### 1. Increase staleTime on all low-value hooks (30s → 2min+)

| File | Current | New | Rationale |
|------|---------|-----|-----------|
| `useOrdersList.ts` | 30s | 2 min | Order lists don't change every 30s |
| `useOrderDetail.ts` (main) | 30s | 2 min | Order detail has realtime sub already |
| `useOrderDetail.ts` (review) | 60s | 5 min | Reviews rarely change |
| `useServiceBookings.ts` | 30s | 2 min | Bookings don't shift every 30s |
| `AdminServiceBookingsPage.tsx` | 30s | 2 min | Same reasoning |
| `useServiceSlots.ts` | 15s | 60s | Slots for a specific product are stable |
| `SearchAutocomplete.tsx` (2 queries) | 30s | 2 min | Search results for same query don't change |
| `PaymentStatusCard.tsx` | 30s | 2 min | Payment status is stable |
| `SellerFestivalParticipation.tsx` | 30s | 5 min | Festival config rarely changes |
| `AdminCronManager.tsx` (jobs) | 30s | 2 min | Cron jobs are stable |
| `AdminCronManager.tsx` (runs) | 15s | 60s | Runs list while viewing |
| `NotificationDiagnostics.tsx` (2 queries) | 30s | 2 min | Admin diagnostic, not real-time |
| `useAdminAnalytics.ts` (overview) | 30s | 5 min | Heavy aggregation, rarely changes |
| `useAdminAnalytics.ts` (orders table) | 15s | 2 min | Admin orders table |
| `useAdminAnalytics.ts` (seller, category, products) | 30s | 5 min | Analytics aggregates |
| `OrdersPage.tsx` (eta query) | 15s | 2 min | ETA data is stable |
| `ActiveOrderStrip.tsx` | 15s | 30s | Active orders need some freshness but 15s is excessive |
| `useUnreadNotificationCount.ts` | 30s | 60s | Count, not critical |

### 2. Fix aggressive fetch patterns

| File | Issue | Fix |
|------|-------|-----|
| `FestivalCollectionPage.tsx` | `staleTime: 0`, `refetchOnMount: 'always'`, `refetchInterval: 30s` | staleTime → 2 min, remove refetchOnMount, remove refetchInterval |
| `useNotifications.ts` (infinite) | `staleTime: 0`, `refetchInterval: 30s` | staleTime → 60s, refetchInterval → 60s |
| `useNotifications.ts` (latest action) | `staleTime: 10s`, `refetchInterval: 30s` | staleTime → 30s, refetchInterval → 60s |
| `AdminAIReviewLog.tsx` | `refetchInterval: 30s`, no staleTime | Add staleTime 2 min, refetchInterval → 60s |
| `useCart.tsx` | `refetchOnMount: 'always'` | Remove — staleTime already handles freshness |

### 3. Summary of scope
- ~18 files changed
- No functional changes — only cache timing adjustments
- All changes align with the performance rules in project memory
- Zero risk of regression since we're only reducing unnecessary network calls

