

## Plan — Fix Schedule + Notification Routing (3 issues)

### Issue 1 & 2 — Seller Schedule (combined fix)

**Root cause confirmed in DB**: Seller "Ayurveda" (`b9914568…`) has an `in_progress` booking on **Mon 2026-04-20**. Today is Sat 2026-04-18. The Schedule tab only renders:
- `ServiceBookingStats` (counts)
- `ScheduleWeekView` (current week mini-strip — Mon 13 → Sun 19, so Apr 20 is **not** in this week's strip)
- `SellerDayAgenda` — hard-coded to `startOfToday()` only

So accepted future bookings exist but are invisible. Fix is purely UI:

**Build a new `SellerScheduleView` component** (`src/components/seller/SellerScheduleView.tsx`) that replaces the trio (`ScheduleWeekView` + `SellerDayAgenda`) with one unified calendar view:

1. **Date selector strip** — horizontally scrollable 14-day window (today − 1 → today + 13), tap to select. Each day shows a dot if it has bookings. Today is highlighted; selected day is filled.
2. **Week navigation** — `‹ Prev week | This week | Next week ›` buttons that shift the 14-day window in 7-day jumps. (Plus a small "Jump to today" button.)
3. **Selected day's agenda** — same timeline UI as today's `SellerDayAgenda`, but driven by the selected date instead of `startOfToday()`. Reuses the same booking row design (status pill, time, buyer, Accept/View buttons).
4. **Empty state per day** — "Nothing scheduled for {Mon, 13 Apr}" instead of generic "today".
5. Source data: existing `useSellerServiceBookings(sellerId)` hook already fetches a 7-day-back-to-+future window with `limit(500)` — extend the lower bound to today and bump window to cover ~30 days forward (change one line in `useServiceBookings.ts`: `gte('booking_date', today)` and add no upper bound; keep limit 500).

In `SellerDashboardPage.tsx`, replace lines 428–429 (`ScheduleWeekView` + `SellerDayAgenda`) with the new `<SellerScheduleView sellerId={sellerProfile.id} />`. Remove the now-unused `ScheduleWeekView` helper at the bottom of the file.

This solves both Issue 1 (the 20 Apr booking becomes visible by tapping Mon 20) and Issue 2 (full forward navigation across days/weeks).

---

### Issue 3 — Notifications redirect to wrong page (P0)

**Root cause confirmed**: Many DB triggers write `reference_path = '/seller/orders/<id>'`, but `App.tsx` has no `/seller/orders/:id` route — only `/orders/:id`. React Router falls back, the user lands on a generic page that looks empty.

**Fix — two-part (defense in depth)**:

**A. Add the missing route alias (instant fix, no data migration)** in `src/App.tsx` next to the existing orders routes:
```tsx
<Route path="/seller/orders/:id" element={<ProtectedRoute><RouteErrorBoundary sectionName="Order Details"><OrderDetailPage /></RouteErrorBoundary></ProtectedRoute>} />
<Route path="/seller/orders" element={<Navigate to="/orders" replace />} />
```
This immediately makes every existing notification (and any new one written by triggers) deep-link correctly to the same `OrderDetailPage` the buyer route uses. `OrderDetailPage` already detects buyer-vs-seller perspective from the order itself, so no extra logic needed.

**B. Harden `resolveNotificationRoute`** (`src/lib/notification-routes.ts`) so even if `reference_path` is missing, sellers/buyers land on `/orders/:id`. Already does this — verified. No change needed beyond adding a tiny normalizer in `RichNotificationCard.handleAction` and `NotificationInboxPage.handleTap`: if `path.startsWith('/seller/orders/')` keep as-is (route now exists). No rewrite needed because route A handles it.

No DB migration required — the existing rows with `/seller/orders/<id>` paths immediately start working.

---

### Files touched
| File | Change |
|---|---|
| `src/components/seller/SellerScheduleView.tsx` | NEW — unified date-strip + agenda |
| `src/pages/SellerDashboardPage.tsx` | Replace `ScheduleWeekView`+`SellerDayAgenda` with new view; drop `ScheduleWeekView` helper |
| `src/hooks/useServiceBookings.ts` | Widen `useSellerServiceBookings` window to today → +30 days |
| `src/App.tsx` | Add `/seller/orders/:id` and `/seller/orders` routes |

### Out of scope
- Deleting `SellerDayAgenda.tsx` (kept; may still be used elsewhere — will check during implementation and remove if orphan).
- Rewriting historical `reference_path` values (the route alias makes it unnecessary).
- Backend trigger cleanup to standardize on `/orders/:id` going forward — can be a follow-up housekeeping pass.

