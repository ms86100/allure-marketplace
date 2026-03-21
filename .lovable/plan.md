

# Round 16: 5 Critical Bugs — Timezone, Notifications & Live Scheduling

## Bug 1: Booking reminder notification links to `/orders` (list) instead of the specific order

**Where:** `supabase/functions/send-booking-reminders/index.ts` line 105

**What happens:** The buyer reminder notification has `reference_path: '/orders'` — a generic orders list. When a buyer taps the "⏰ Appointment in 1 hour" notification (in-app or push), they land on the orders list page, not on the specific order detail with the appointment card. The payload contains `bookingId` and `entity_id` but NOT `order_id`. The `resolveNotificationRoute` fallback doesn't handle `booking_reminder_*` types (falls to `/notifications`).

Meanwhile, the seller reminder at line 138 has `reference_path: '/seller/orders'` — also generic.

The `RichNotificationCard` action button calls `navigate(referencePath)` — so it goes to `/orders`.

**Why critical:** The buyer gets a time-sensitive "Appointment in 10 minutes" alert with a "Open Now" action button, taps it, and lands on the orders list. They must scroll/search to find the right order. For an imminent appointment, this is a trust-breaking dead end.

**Fix:** The edge function needs the `order_id` from the `service_bookings` table (which it already fetches but doesn't select). Change the query at line 49 to include `order_id`, then set `reference_path: '/orders/${booking.order_id}'` for buyer, and `reference_path: '/seller/orders'` for seller (seller order detail uses a different route pattern but `/seller/orders` is acceptable).

**Impact analysis:**
- Only `supabase/functions/send-booking-reminders/index.ts` modified + deploy
- Risk 1: If `order_id` is null for some bookings, the path becomes `/orders/null`. Add a fallback to `/orders` when `order_id` is missing.
- Risk 2: None — existing notifications already in the queue keep their old paths; only new reminders get the fix.

---

## Bug 2: `generate-order-suggestions` uses UTC time — suggestions misfire for IST users

**Where:** `supabase/functions/generate-order-suggestions/index.ts` lines 18-20

**What happens:** The function uses `now.getDay()` and `now.getHours()` on a raw `new Date()` — which runs in UTC on Deno edge functions. At IST 8 AM (breakfast time), the function thinks it's 2:30 AM UTC and matches "early morning" patterns. At IST 8 PM (dinner time), it sees 2:30 PM UTC and matches "afternoon" patterns.

The scoring at line 71 compares `orderDate.getDay()` and `orderDate.getHours()` — also in UTC — against the current UTC time. While the relative comparison is internally consistent (both sides UTC), the actual suggestion timing is wrong: a buyer opening the app at dinner time in India gets lunch-time suggestions.

**Why critical:** Smart suggestions are meant to feel personalized and contextual. Wrong time-of-day matching makes them feel random, undermining the "the app knows me" trust factor.

**Fix:** Apply the same IST offset pattern used in `send-booking-reminders`:
```typescript
const IST_OFFSET_MS = 5.5 * 60 * 60_000;
const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
const currentDay = nowIST.getUTCDay();
const currentHour = nowIST.getUTCHours();
```
And apply the same offset when extracting `day` and `hour` from `orderDate` at line 70-71.

**Impact analysis:**
- Only `supabase/functions/generate-order-suggestions/index.ts` modified + deploy
- Risk 1: If the marketplace expands beyond India, this hardcoded offset breaks. But per memory, the platform is India-based, so IST is correct.
- Risk 2: Existing cached suggestions will be stale until the next cron run regenerates them. This is self-healing.

---

## Bug 3: `UpcomingAppointmentBanner` uses device timezone — shows wrong "Today" label for travelers

**Where:** `src/components/home/UpcomingAppointmentBanner.tsx` lines 42-43, 59, 100-108

**What happens:** The banner computes `today` using `format(now, 'yyyy-MM-dd')` from `date-fns`, which uses the device's local timezone. Booking dates in the DB are stored as IST dates (plain `YYYY-MM-DD`). If a buyer's device is in a different timezone (e.g., traveling to Dubai, UTC+4), `format(now, 'yyyy-MM-dd')` produces a different date than IST at the boundary hours (10:30 PM Dubai = 12:00 AM IST next day).

The `nowMinutes` calculation at line 59 also uses device time (`now.getHours()`), which could filter out a valid upcoming appointment (e.g., at IST midnight, the buyer's Dubai device says 10:30 PM — the booking at IST 00:30 would be filtered as "past" because 22*60+30 > 0*60+30).

Same issue in `BuyerBookingsCalendar.tsx` line 31: `new Date(`${booking.booking_date}T${booking.start_time}`)` parses as local timezone, not IST.

**Why critical:** The home banner is the primary touchpoint for upcoming appointments. Showing "No upcoming appointments" when one exists (or showing tomorrow's as today's) directly undermines scheduling trust.

**Fix:** In `UpcomingAppointmentBanner.tsx`, compute `today` and `nowMinutes` using IST, matching the pattern in `store-availability.ts`:
```typescript
const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
const today = format(nowIST, 'yyyy-MM-dd');
const nowMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();
```
And for the dateLabel computation (lines 100-108), parse booking dates as IST for `isToday`/`isTomorrow` checks.

Same fix for `BuyerBookingsCalendar.tsx` — use IST for countdown calculations.

**Impact analysis:**
- `UpcomingAppointmentBanner.tsx` and `BuyerBookingsCalendar.tsx` modified
- Risk 1: `toLocaleString` with timezone is slower than raw `new Date()`. For a single call per render, this is negligible.
- Risk 2: If `date-fns` `isToday`/`isTomorrow` are still compared against device time internally, we need to use manual IST date comparison instead. The fix should avoid `isToday()` and instead compare formatted date strings.

---

## Bug 4: Seller dashboard stats use device timezone for "today" and "this week" boundaries

**Where:** `src/hooks/queries/useSellerOrders.ts` lines 27-34

**What happens:** The stats query computes `today` and `weekStart` using `new Date()` with `setHours(0, 0, 0, 0)` — device local time. The `created_at` field in orders is UTC. For an IST-based seller:
- At IST 1 AM (UTC 7:30 PM previous day), `todayISO = "2026-03-20T19:30:00Z"` — this misses orders placed between UTC 00:00 and 19:30, i.e., orders from IST 5:30 AM to 1:00 AM are excluded from "today's" count.
- The "this week" boundary uses `.getDay()` on device time, which could shift the week boundary by a day.

**Why critical:** A food seller checking "Today's Orders" at 11 PM IST sees correct data. But at 1 AM IST (still "today" for late-night orders), the counter resets to 0 because the device's midnight already passed. Late-night sellers (bakeries, fast food) see incorrect daily revenue.

**Fix:** Use IST-aware date computation:
```typescript
const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
nowIST.setHours(0, 0, 0, 0);
const todayISO = nowIST.toISOString();
```

**Impact analysis:**
- Only `useSellerOrders.ts` modified (lines 27-34)
- Risk 1: `toLocaleString` timezone conversion creates a Date that JS treats as local device timezone. The `.toISOString()` output will be different than expected. Need to compute the IST midnight as UTC: `new Date('2026-03-21T00:00:00+05:30').toISOString()` → `"2026-03-20T18:30:00.000Z"`.
- Risk 2: None — query is read-only.

---

## Bug 5: `Header.tsx` greeting uses device timezone — says "Good morning" at midnight IST if device is in different TZ

**Where:** `src/components/layout/Header.tsx` line 26

**What happens:** `new Date().getHours()` uses device local time. A buyer in IST sees correct greetings. But a buyer traveling abroad (or with a misconfigured device timezone) sees "Good morning" at IST evening or vice versa. This is a minor cosmetic issue on its own, BUT combined with Bug 3 (banner timezone) it creates a compound trust gap: the app says "Good evening" while showing "Tomorrow" for a booking that's actually today in IST.

More practically: the `getGreeting` is memoized by `profile?.name` only (line 88) — it doesn't re-compute when the hour changes. A buyer who opens the app at 11:55 AM and keeps it open past noon still sees "Good morning" indefinitely until re-render.

**Why critical:** The greeting is the first thing a buyer sees on the home screen. While individually minor, a stale or wrong greeting alongside timezone-misaligned booking data creates a cumulative "something's off" feeling.

**Fix:** Use IST for the greeting and add the hour to the memo dependency:
```typescript
function getGreeting(name?: string | null): string {
  const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
  // ... rest same
}
// Update memo to include a coarse time key
const hourKey = new Date().getHours(); // re-renders on navigation anyway
const greeting = useMemo(() => getGreeting(profile?.name), [profile?.name, hourKey]);
```

**Impact analysis:**
- Only `src/components/layout/Header.tsx` modified (2 lines)
- Risk 1: Adding `hourKey` to useMemo deps causes re-computation on every render (since `new Date().getHours()` is called fresh). But `getGreeting` is trivial — no perf concern.
- Risk 2: None — purely cosmetic.

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | Booking reminders link to generic `/orders` instead of specific order | **HIGH** — dead-end on urgent tap | `send-booking-reminders/index.ts` |
| 2 | Order suggestions use UTC — wrong time-of-day matching | **MEDIUM** — irrelevant suggestions | `generate-order-suggestions/index.ts` |
| 3 | Upcoming appointment banner uses device TZ — wrong "Today" label | **HIGH** — missed appointments | `UpcomingAppointmentBanner.tsx`, `BuyerBookingsCalendar.tsx` |
| 4 | Seller dashboard stats use device TZ — wrong daily counts | **HIGH** — wrong revenue/order counts | `useSellerOrders.ts` |
| 5 | Header greeting uses device TZ and is stale | **LOW** — cosmetic but compounds trust gap | `Header.tsx` |

## Files to Edit

- `supabase/functions/send-booking-reminders/index.ts` — Bug 1 (add `order_id` to query, fix `reference_path`)
- `supabase/functions/generate-order-suggestions/index.ts` — Bug 2 (IST offset for time matching)
- `src/components/home/UpcomingAppointmentBanner.tsx` — Bug 3 (IST-aware date/time)
- `src/components/booking/BuyerBookingsCalendar.tsx` — Bug 3 (IST-aware countdown)
- `src/hooks/queries/useSellerOrders.ts` — Bug 4 (IST-aware today/week boundaries)
- `src/components/layout/Header.tsx` — Bug 5 (IST greeting + memo fix)

## Cross-Impact Analysis

- Bug 1: Edge function only — no client code changes. Existing notifications unaffected.
- Bug 2: Edge function only — suggestions regenerate on next cron run.
- Bug 3: Two client components — no shared state affected. The IST helper pattern already exists in `store-availability.ts`.
- Bug 4: Query boundary change — only affects stat display, not order data.
- Bug 5: Cosmetic only — no downstream dependencies.

