
# Round 21: 5 Critical Bugs — Seller Store Configuration, Listings & Slots

## Bug 1: `service_bookings.status` never syncs with `orders.status` — seller sees stale booking status

**Where:** `src/hooks/useOrderDetail.ts` line 194 — updates `orders.status` only; no trigger or code syncs to `service_bookings.status`

**What happens:** When a seller confirms an order (order status moves from `requested` → `confirmed`), the linked `service_bookings` row stays at `requested`. DB confirms: order `9f0dfe9b` is `confirmed` but its booking `a6d06b13` is still `requested`. The `SellerDayAgenda` reads booking status directly, so it shows "requested" badges on confirmed appointments. The `ServiceBookingStats` counts "Pending" bookings that are actually confirmed at the order level. The buyer sees "Confirmed" on their order, but the seller's schedule tab shows "requested" — contradictory.

**Why critical:** The seller's entire Schedule tab is built on `service_bookings.status`. If it's permanently stuck at `requested`, the day agenda, stats, and booking reminders all operate on wrong data. The `send-booking-reminders` edge function also reads `service_bookings.status` to decide which reminders to send.

**Impact:** `SellerDayAgenda`, `ServiceBookingStats`, `send-booking-reminders` edge function, `useServiceBookings` hook, `SellerDashboardPage` Schedule tab

**Risks:** (1) Adding a DB trigger on `orders` to sync `service_bookings.status` must handle the different enum types between the two tables (orders uses `order_status`, bookings uses its own status enum). (2) Historical data — existing bookings stuck at `requested` need a one-time migration to sync.

**Fix:** Create a DB trigger `sync_booking_status_on_order_update` on the `orders` table that, on status change, updates the matching `service_bookings.status` to the new order status (with appropriate enum mapping). Also run a one-time data fix migration.

---

## Bug 2: Slot generation includes unapproved products — ghost slots created for pending/draft services

**Where:** `ServiceAvailabilityManager.tsx` line 155-159 — queries `products` with only `.eq('is_available', true)`, no `approval_status` filter

**What happens:** When a seller saves their schedule and clicks "Generate Slots," the code fetches all `is_available = true` products to determine service durations. But new products default to `approval_status: 'pending'` (line 232 in `useSellerProducts.ts`). These unapproved products get slots generated. A buyer could see and book time slots for a service that hasn't been approved by admin yet. The `useServiceSlots` hook (buyer-facing) has no `approval_status` filter either — it just checks `product_id` and `is_blocked`.

**Why critical:** This bypasses the entire product approval lifecycle. An unapproved or rejected service still has bookable slots visible to buyers, violating the admin review gate.

**Impact:** `ServiceAvailabilityManager`, `useServiceSlots`, buyer booking flow, admin approval process

**Risks:** (1) Adding `approval_status = 'approved'` filter to slot generation means newly onboarded sellers (whose products start as pending) will see "no slots generated" until admin approves — this is correct behavior but needs a clear message. (2) Existing slots for unapproved products need cleanup.

**Fix:** Add `.eq('approval_status', 'approved')` to the product query in `ServiceAvailabilityManager` (line 157). Update the "no products" toast to mention approval. In `useServiceSlots`, add a join or filter to only return slots for approved products.

---

## Bug 3: "No bookings yet" empty state always visible on Schedule tab — even when bookings exist

**Where:** `SellerDashboardPage.tsx` lines 305-316

**What happens:** The "No bookings yet" card with a `CalendarDays` icon is always rendered after `ServiceBookingStats` and `SellerDayAgenda`. It's not wrapped in any conditional. A seller with active bookings sees: (1) booking stats cards, (2) today's schedule timeline, (3) "No bookings yet" — all stacked on the same screen. The comment on line 301 says "This covers the case where seller has zero service bookings ever" but the condition is never actually checked.

**Why critical:** The seller dashboard Schedule tab is the primary booking management surface. An always-visible "No bookings yet" message underneath real booking data makes the entire tab feel broken. It undermines the seller's confidence that the system is tracking their appointments.

**Impact:** `SellerDashboardPage` Schedule tab

**Risks:** (1) Need to check both `ServiceBookingStats` (returns null when empty) and `SellerDayAgenda` (returns a card with "Nothing scheduled" when empty today). The empty state should only show when the seller has truly zero service bookings. (2) The `useSellerServiceBookings` hook returns all bookings — can reuse it.

**Fix:** Import `useSellerServiceBookings` in `SellerDashboardPage` and conditionally render the empty state only when `bookings.length === 0`.

---

## Bug 4: `delivery_radius_km` persists at stale value when `sell_beyond_community` is toggled OFF — RPC still uses it

**Where:** `useSellerSettings.ts` line 140 — always saves `delivery_radius_km: formData.delivery_radius_km` regardless of `sell_beyond_community` state

**What happens:** A seller sets `sell_beyond_community = true` with `delivery_radius_km = 10`, saves. Then toggles `sell_beyond_community` back to `false` and saves again. The DB still stores `delivery_radius_km = 10`. The `search_sellers_by_location` RPC (Round 18 fix) now checks `sell_beyond_community` to gate cross-society visibility, but the `delivery_radius_km` value persists. If the seller later re-enables cross-society sales, the old 10km radius is silently active. More critically, the UI hides the radius slider when the toggle is off (line 302-308), so the seller never sees the stale value.

The real risk is more subtle: the `search_sellers_by_location` RPC uses `delivery_radius_km` in distance calculations for ALL sellers (even society-resident ones), regardless of `sell_beyond_community`. A society seller with `sell_beyond_community = false` but `delivery_radius_km = 10` could still appear in edge cases.

**Why critical:** Silent data inconsistency. The seller's intent ("I don't want cross-society sales") doesn't match the stored radius. The RPC should ideally ignore `delivery_radius_km` when `sell_beyond_community` is false, but defensive coding requires resetting it.

**Impact:** `useSellerSettings.ts`, `SellerSettingsPage`, `search_sellers_by_location` RPC

**Risks:** (1) Resetting to 5km when toggling off means the seller loses their custom radius if they toggle back on — minor UX friction. (2) The onboarding flow in `useSellerApplication` has the same issue.

**Fix:** In `useSellerSettings.ts` `handleSave`, when `sell_beyond_community` is false, set `delivery_radius_km` to the default (5). Same fix in `useSellerApplication.ts`.

---

## Bug 5: Seller settings save doesn't reset `operating_days` correctly — empty array saves as empty and auto-closes store permanently

**Where:** `useSellerSettings.ts` line 132 — saves `operating_days: formData.operating_days` which can be `[]`

**What happens:** In `SellerSettingsPage`, the operating days are toggle-based (line 217-224). A seller can deselect ALL days. When saved, `operating_days = []` is written to DB. The `computeStoreStatus` function (line 29 in `store-availability.ts`) checks: `if (operatingDays && operatingDays.length > 0 && !operatingDays.includes(currentDay))` — with an empty array, `operatingDays.length > 0` is false, so it skips the day check entirely. The store appears "open" at the client level. BUT the `search_sellers_by_location` RPC and the `compute_store_status` DB function (referenced in discovery) may have their own day check that returns `closed_today` for empty arrays, causing a disconnect between what the seller sees ("store is open") and what buyers see (store not appearing).

More practically: there's no validation preventing saving with zero operating days. A seller who accidentally deselects all days has no warning and gets silently invisible (or inconsistently visible depending on which code path evaluates the schedule).

**Why critical:** Zero operating days is an invalid configuration that should be blocked. The lack of validation means a seller can silently make themselves invisible to all buyers with no feedback about what went wrong.

**Impact:** `useSellerSettings.ts`, `SellerSettingsPage`, `computeStoreStatus`, `useSellerHealth` (doesn't check for zero days, only checks "operating days set")

**Risks:** (1) Adding validation could block a save if the seller is trying to update something else (e.g., description) while days happen to be empty. Should be a non-blocking warning rather than a hard block. (2) The `useSellerHealth` check at line 214 says `operating_days.length > 0` is "pass" — it should be "fail" when empty.

**Fix:** Add validation in `handleSave` that warns (toast) if `operating_days` is empty but still allows save. Update `useSellerHealth` to mark zero operating days as `fail` instead of skipping.

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | `service_bookings.status` never syncs with `orders.status` | **CRITICAL** | DB migration (new trigger), one-time data fix |
| 2 | Slot generation for unapproved products | **HIGH** | `ServiceAvailabilityManager.tsx`, `useServiceSlots.ts` |
| 3 | "No bookings yet" always shown on Schedule tab | **MEDIUM** | `SellerDashboardPage.tsx` |
| 4 | `delivery_radius_km` persists when `sell_beyond_community` OFF | **MEDIUM** | `useSellerSettings.ts`, `useSellerApplication.ts` |
| 5 | Zero operating days saves without warning | **MEDIUM** | `useSellerSettings.ts`, `useSellerHealth.ts` |

## Technical Details

### Bug 1 — DB trigger + data fix migration:
```sql
-- Trigger: sync service_bookings.status when orders.status changes
CREATE OR REPLACE FUNCTION sync_booking_status_on_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.order_type = 'booking' THEN
    UPDATE service_bookings SET status = NEW.status::text
    WHERE order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- One-time fix for existing out-of-sync bookings
UPDATE service_bookings sb
SET status = o.status::text
FROM orders o
WHERE sb.order_id = o.id AND sb.status::text != o.status::text;
```

### Bug 2 — Add approval filter:
In `ServiceAvailabilityManager.tsx` line 155-159, change:
```typescript
.eq('is_available', true)
```
to:
```typescript
.eq('is_available', true)
.eq('approval_status', 'approved')
```

### Bug 3 — Conditional empty state:
Wrap the empty-state div in `SellerDashboardPage.tsx` with a check using the same `useSellerServiceBookings` hook data.

### Bug 4 — Reset radius on toggle-off:
In `useSellerSettings.ts` `handleSave`, change line 140:
```typescript
delivery_radius_km: formData.sell_beyond_community ? formData.delivery_radius_km : 5,
```

### Bug 5 — Validation + health check:
In `handleSave`, add a warning toast if `operating_days` is empty. In `useSellerHealth.ts` line 214-218, mark zero days as `warn` status.

### Files to edit:
- **DB Migration** — Bug 1: sync trigger + data fix
- `src/components/seller/ServiceAvailabilityManager.tsx` — Bug 2: add `approval_status` filter
- `src/pages/SellerDashboardPage.tsx` — Bug 3: conditional empty state
- `src/hooks/useSellerSettings.ts` — Bugs 4, 5: reset radius, validate days
- `src/hooks/useSellerApplication.ts` — Bug 4: reset radius on toggle-off
- `src/hooks/queries/useSellerHealth.ts` — Bug 5: zero days = warn
