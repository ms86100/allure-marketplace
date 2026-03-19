

# Eliminate All Remaining Hardcoded Status Logic

## What's Still Wrong

1. **`NEGATIVE_TERMINALS` hardcoded set** — `cancelled`, `no_show` in frontend code
2. **OTP inferred from `actor === 'delivery'`** — no explicit DB flag
3. **Backend edge functions** use hardcoded status strings (`'placed'`, `'delivered'`, `'completed'`)
4. **`isUrgentOrder`** uses `auto_cancel_at` presence — still indirect coupling

## DB Schema Changes (Migration)

Add two new boolean columns to `category_status_flows`:

```sql
ALTER TABLE public.category_status_flows
  ADD COLUMN is_success boolean NOT NULL DEFAULT true,
  ADD COLUMN requires_otp boolean NOT NULL DEFAULT false;

-- Mark negative terminals
UPDATE public.category_status_flows SET is_success = false WHERE status_key IN ('cancelled', 'no_show');

-- Mark OTP-required steps (delivery handoff steps)
UPDATE public.category_status_flows SET requires_otp = true WHERE actor = 'delivery';
```

Also add a `system_settings` row for backend-consumed status sets:

```sql
INSERT INTO public.system_settings (key, value) VALUES
  ('cancellable_statuses', '["placed"]'),
  ('archivable_statuses', '["completed"]'),
  ('auto_completable_statuses', '["delivered"]')
ON CONFLICT (key) DO NOTHING;
```

## Frontend Changes

### `useCategoryStatusFlow.ts`
- **Remove** `NEGATIVE_TERMINALS` hardcoded set entirely
- Update `StatusFlowStep` interface: add `is_success: boolean`, `requires_otp: boolean`
- Update all `.select()` calls to include `is_success, requires_otp`
- `isSuccessfulTerminal()` → `step.is_terminal && step.is_success` (pure DB flags)
- `stepRequiresOtp()` → `step.requires_otp` (pure DB flag, no actor inference)
- `useTerminalStatuses()` → query `is_terminal` and `is_success` from DB, build `successSet` using `is_success = true` filter instead of hardcoded exclusion
- `getTimelineSteps()` → filter by `!s.is_terminal` only (remove `s.status_key !== 'cancelled'` hardcoded check — use `!s.is_terminal` which already covers it since cancelled is terminal)

### `useOrderDetail.ts`
- `isUrgentOrder`: keep `auto_cancel_at && isSellerView` — this is data-driven (the column is set by DB logic), not status-name-driven. No change needed here; it's already correct.

### `OrderDetailPage.tsx`
- `stepRequiresOtp(flow, nextStatus)` call already exists — will now read `requires_otp` from DB instead of inferring from actor

## Backend Edge Function Changes

### `auto-cancel-orders/index.ts`
- Replace `eq("status", "placed")` and `eq("status", "delivered")` with dynamic lookups:
  - Read `cancellable_statuses` and `auto_completable_statuses` from `system_settings`
  - Use `.in("status", cancellableStatuses)` and `.in("status", autoCompletableStatuses)`

### `archive-old-data/index.ts`
- Replace `eq("status", "completed")` with `archivable_statuses` from `system_settings`

### `process-settlements/index.ts`
- Replace `['delivered', 'completed'].includes(orderData.status)` with a lookup of terminal success statuses from `category_status_flows` where `is_terminal = true AND is_success = true`

### `monitor-stalled-deliveries/index.ts`
- Already reads `transit_statuses` from `system_settings` ✅ — just ensure the hardcoded fallback `['picked_up', 'on_the_way', 'at_gate']` is removed or clearly marked as a last-resort safety net that logs a warning

### `update-live-activity-apns/index.ts`
- Replace `FALLBACK_TERMINAL` hardcoded set with a DB query to `category_status_flows` where `is_terminal = true`

## Files to Modify

1. **New migration** — Add `is_success`, `requires_otp` columns + system_settings rows
2. **`src/hooks/useCategoryStatusFlow.ts`** — Remove `NEGATIVE_TERMINALS`, use new DB columns
3. **`supabase/functions/auto-cancel-orders/index.ts`** — Read statuses from system_settings
4. **`supabase/functions/archive-old-data/index.ts`** — Read statuses from system_settings
5. **`supabase/functions/process-settlements/index.ts`** — Query terminal success from DB
6. **`supabase/functions/update-live-activity-apns/index.ts`** — Query terminal from DB

