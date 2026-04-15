
<final-text>Confirmed root cause: the Orders route is still crashing because `useBuyerRecurringConfigs` queries `service_recurring_configs` with `product:products(name)`, but the generated Supabase schema shows `service_recurring_configs` has no relationship to `products` at all. That means the current query is invalid and throws `PGRST200`, which matches the console logs exactly. This affects buyer Orders directly, and seller Orders too when the buying tab/default content mounts. The permanent fix is to remove that invalid join entirely, make optional order widgets fail-safe, and harden Order Detail so non-critical query failures can never blank the whole route again.</final-text>

## Implementation plan

### 1. Fix the confirmed Orders tab crash at the source
**Files:** `src/hooks/useServiceBookings.ts`, `src/components/booking/RecurringBookingsList.tsx`

- Replace the broken recurring-config query with a safe two-step fetch:
  - query `service_recurring_configs` only
  - query `products` separately by collected `product_id`
  - merge names in code for this small result set
- Do not throw route-breaking errors for this optional widget.
- Return a safe fallback (`[]` plus error metadata) so the Orders page can still render even if recurring bookings fail.

### 2. Make buyer/seller Orders page resilient instead of all-or-nothing
**Files:** `src/pages/OrdersPage.tsx`, optionally `src/components/RouteErrorBoundary.tsx` or a small local section-safe wrapper

- Treat these as **non-critical modules**:
  - `BuyerBookingsCalendar`
  - `RecurringBookingsList`
  - `ReviewPromptBanner`
  - `LoyaltyCard`
- If one optional module errors, show a compact fallback/hidden state and keep `OrderList` visible.
- Keep the actual order list as the primary content that must continue rendering.

### 3. Harden Order Detail so a secondary query cannot blank the page
**Files:** `src/hooks/useOrderDetail.ts`, `src/pages/OrderDetailPage.tsx`, `src/hooks/useDeliveryTracking.ts`, `src/hooks/useSupportTickets.ts`, `src/hooks/useServiceBookings.ts`

- Split **critical** vs **non-critical** data:
  - Critical: main order fetch
  - Non-critical: service booking, support tickets, timeline, delivery-assignment extras, feedback helpers
- For the primary order query:
  - add explicit `isError/error/refetch` handling
  - replace fragile `.single()` lookups like `category_config.single()` with `maybeSingle()` where “no row” is acceptable
  - fall back to default flow instead of rejecting the whole page
- For secondary hooks:
  - return `null`/`[]` on recoverable failures
  - log the error with hook + orderId context
  - render the card only when its data is available
- In `useDeliveryTracking`, replace `.single()` with `maybeSingle()` so missing assignments do not create noisy failures.

### 4. Add durable fallback UI and structured logging
**Files:** `src/pages/OrdersPage.tsx`, `src/pages/OrderDetailPage.tsx`, maybe `src/components/RouteErrorBoundary.tsx`

- Add clear in-page fallback states for:
  - “Couldn’t load recurring bookings”
  - “Couldn’t load support tickets”
  - “Couldn’t load appointment details”
  - “Couldn’t load order right now” for the primary order query
- Add contextual logs like:
  - `[OrdersPage][RecurringConfigs]`
  - `[OrderDetail][PrimaryQuery]`
  - `[OrderDetail][SupportTickets]`
  - `[OrderDetail][ServiceBooking]`
- This ensures future failures are visible and diagnosable instead of turning into a silent dark screen.

### 5. Regression validation after implementation
- Verify buyer `/orders` loads with order list visible.
- Verify seller `/orders` loads on both tabs.
- Verify buyer can open an order detail page.
- Verify seller can open an order detail page.
- Confirm no `PGRST200` for `service_recurring_configs -> products`.
- Confirm optional-panel failures no longer blank the route.
- Confirm route-level fallback UI is visible if the primary order query truly fails.

## Technical details

```text
Confirmed root issue:
OrdersPage
  -> RecurringBookingsList
    -> useBuyerRecurringConfigs
      -> service_recurring_configs.select('*, product:products(name)')
      -> PGRST200 (no FK relationship exists)

Why the previous fix was not bulletproof:
- Removing the explicit FK hint was not enough.
- The table has zero relationships in generated Supabase types.
- Any relational join to products from this table is invalid.
```

### Files expected to change
- `src/hooks/useServiceBookings.ts`
- `src/components/booking/RecurringBookingsList.tsx`
- `src/pages/OrdersPage.tsx`
- `src/hooks/useOrderDetail.ts`
- `src/pages/OrderDetailPage.tsx`
- `src/hooks/useDeliveryTracking.ts`
- possibly `src/hooks/useSupportTickets.ts`

### Scope
- No database migration required for the permanent UI fix
- No new dependencies
- Focused on permanent resilience, not a cosmetic workaround
