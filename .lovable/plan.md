

## Root cause confirmed

**Issue 1 (no Accept Order button):** Order `223b3d5e…` has `transaction_type='seller_delivery'`. The `category_status_flows` table has **no rows** for `(default, seller_delivery)` or `(education_learning, seller_delivery)` — only `(food_beverages, seller_delivery)`. So `useCategoryStatusFlow` returns an empty `flow`. The seller action bar guard `o.flow.length > 0` fails → the fixed bottom CTA never renders. Transitions DO exist in `category_status_transitions` for `default + seller_delivery` (`placed → accepted`, allowed_actor=seller), so the data is half-configured. Same problem hits any seller whose `primary_group` is anything other than `food_beverages` placing a `seller_delivery` order.

**Reminder fatigue:** `useNewOrderAlert.snooze()` re-surfaces after a fixed 60s. There's no choice of interval and no "remember my choice" — every snooze re-asks the same way.

---

## Plan

### Fix 1 — Backfill missing seller_delivery flow (DB migration)
Insert `default + seller_delivery` rows into `category_status_flows` mirroring `food_beverages + seller_delivery` (placed → accepted → preparing → ready → picked_up → on_the_way → delivered + cancelled terminal). Use the same `actor`, `is_terminal`, `is_success`, `otp_type`, labels and hints as the food_beverages variant so the workflow engine resolves identically for every group via the `default` fallback.

Also backfill `default + delivery` and `default + pickup`/`self_pickup` rows if they're similarly missing (quick audit during migration).

### Fix 2 — Defensive UI fallback when flow is missing
In `OrderDetailPage.tsx`, when `o.flow.length === 0` AND transitions exist, render a minimal seller action bar driven purely from `transitions` (using `getNextStatusesForActor`). This guarantees the Accept button appears even if any future workflow row is missing — defense in depth so we never block the seller again.

### Fix 3 — Surface "Accept Order" prominently above the fold
Add a primary-color **"Accept Order"** call-to-action card directly under the `ExperienceHeader` for the seller view when `order.status === 'placed'` (or the resolved first non-terminal status). It mirrors the bottom action bar but is unmissable on entry — solving the "I clicked View Order and don't know what to do" complaint. Includes secondary "Reject" link.

### Fix 4 — Notification → Action deep link continuity
When the seller arrives at the order page from a notification (existing `?from=notification` or `location.state.from='deeplink'`), auto-scroll to the new "Accept Order" card and pulse-highlight it for 2s using `framer-motion`. No new params needed — reuse what's already plumbed.

### Fix 5 — Smart reminder system in `useNewOrderAlert` + overlay
Replace the silent fixed-60s snooze with an explicit choice the first time, then remember per-session:

1. **First snooze**: `NewOrderAlertOverlay` opens a small inline picker offering **"Remind in 5 min"** / **"Remind in 10 min"** / **"Dismiss"**.
2. Save the chosen interval to `sessionStorage` (`seller_snooze_pref_minutes`). Subsequent snoozes use the saved value silently — no second prompt.
3. After the chosen interval the order re-enters `pendingAlerts` and the bell loop restarts (existing logic).
4. Add a "Change reminder interval" link in seller settings (existing `SellerSettingsPage`) so the user can reset the preference.
5. Cap re-triggers at 3 cycles per order; after that, downgrade to a silent persistent banner so we never drain battery indefinitely.

Files: `src/hooks/useNewOrderAlert.ts` (interval param + cycle counter), `src/components/seller/NewOrderAlertOverlay.tsx` (choice UI), `src/pages/SellerSettingsPage.tsx` (preference toggle).

### Fix 6 — Verify Orders list also shows the Accept action
With Fix 1+2, the existing `SellerOrderCard` `getFlowLabel` and dashboard inline actions will start resolving correctly for every group. Verify by checking `useSellerDashboardOrders` consumes the same flow hook.

---

## Files

**DB migration (new)**
- Backfill `category_status_flows` rows for `default + seller_delivery` (and audit/backfill `default + delivery`, `default + self_pickup` if missing).

**Edited**
- `src/hooks/useCategoryStatusFlow.ts` — log a warning when both group AND default flow lookups are empty (telemetry guardrail).
- `src/pages/OrderDetailPage.tsx` — (a) add prominent "Accept Order" hero card directly under `ExperienceHeader` for seller view; (b) defensive transitions-only action bar when flow is empty; (c) auto-scroll/pulse when arriving from notification.
- `src/hooks/useNewOrderAlert.ts` — accept `snoozeMinutes` argument, per-order cycle counter, downgrade after 3 cycles.
- `src/components/seller/NewOrderAlertOverlay.tsx` — replace single "Remind me later" link with one-time interval picker (5/10 min), persist to sessionStorage, silent re-snooze afterward.
- `src/pages/SellerSettingsPage.tsx` — add "Reminder interval" preference (5/10/15 min, default 5).

## Out of scope
- No RLS changes.
- No new realtime channels.
- No redesign of `SellerOrderCard` beyond verifying Fix 1 makes its existing actions resolve.

