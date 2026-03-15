

# Dynamic Workflow Engine — Detailed Implementation Plan

## Current State

- **`category_status_flows`** table has 8 workflows (all service-related). **No workflows exist for `cart_purchase`, `buy_now`, or `self_fulfillment`** — these fall through to hardcoded arrays.
- **`validate_order_status_transition`** enforces `sort_order + 1` sequential flow. No actor-based transition validation. No transition table exists.
- **`resolveTransactionType()`** doesn't handle `orderType === 'booking'` — bookings fall to `cart_purchase` which has no DB rows, triggering hardcoded fallbacks.
- **Hardcoded fallbacks** exist in `useOrderDetail.ts` (lines 55-57, 64-68, 137) and `ORDER_STATUS_MAP` in `types/database.ts`.
- **Buyer status hints** in `OrderDetailPage.tsx` (lines 117-130) are hardcoded.
- **No Admin UI** to manage workflows.

---

## Phase 1: Database Schema + Seed Data

### Task 1.1 — Create `category_status_transitions` table

```sql
CREATE TABLE public.category_status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_group text NOT NULL,
  transaction_type text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  allowed_actor text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (parent_group, transaction_type, from_status, to_status, allowed_actor)
);

ALTER TABLE public.category_status_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read transitions"
  ON public.category_status_transitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage transitions"
  ON public.category_status_transitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_cst_lookup
  ON public.category_status_transitions (parent_group, transaction_type, from_status);
```

### Task 1.2 — Add display columns to `category_status_flows`

```sql
ALTER TABLE public.category_status_flows
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT 'bg-gray-100 text-gray-600',
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS buyer_hint text;
```

### Task 1.3 — Seed cart_purchase, self_fulfillment, buy_now workflows

Seed `category_status_flows` for a generic `default` parent_group (used as fallback) for `cart_purchase`, `self_fulfillment`, and `buy_now` transaction types. Also backfill `display_label`, `color`, and `buyer_hint` on ALL existing rows from the current `ORDER_STATUS_MAP` values.

### Task 1.4 — Seed transitions for all workflows

Populate `category_status_transitions` for every `(parent_group, transaction_type)` combination, including:
- Normal forward transitions with correct actors
- **Cancellation transitions**: `*` → `cancelled` for admin; specific early statuses → `cancelled` for seller/buyer
- Non-linear transitions where needed (e.g., `rescheduled` → `confirmed`)

### Task 1.5 — Update `validate_order_status_transition` trigger

Replace the `sort_order + 1` check with a transition-table lookup:

```sql
-- Check transition validity
SELECT EXISTS (
  SELECT 1 FROM public.category_status_transitions
  WHERE parent_group = _parent_group
    AND transaction_type = _txn_type
    AND from_status = OLD.status::text
    AND to_status = NEW.status::text
) INTO _valid;

IF NOT _valid THEN
  RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
END IF;

-- Actor enforcement: delivery/system transitions blocked for regular callers
SELECT allowed_actor INTO _transition_actor
FROM public.category_status_transitions
WHERE parent_group = _parent_group
  AND transaction_type = _txn_type
  AND from_status = OLD.status::text
  AND to_status = NEW.status::text
LIMIT 1;

IF _transition_actor IN ('delivery', 'system') THEN
  IF coalesce(current_setting('app.delivery_sync', true), '') != 'true'
     AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Status "%" can only be set by the delivery system', NEW.status;
  END IF;
END IF;
```

---

## Phase 2: Frontend — Remove Hardcoded Fallbacks

### Task 2.1 — Extend `useCategoryStatusFlow` hook

- Add `display_label`, `color`, `icon`, `buyer_hint` to `StatusFlowStep` interface
- Select these new columns in the query
- Add `orderType === 'booking'` → `'service_booking'` in `resolveTransactionType()`
- Add fallback: if no flow found for specific `parent_group`, try `default` parent_group
- New export: `useStatusTransitions(parentGroup, txnType)` fetching allowed transitions from `category_status_transitions`

### Task 2.2 — Remove hardcoded fallbacks in `useOrderDetail.ts`

- Lines 55-57: Remove hardcoded `statusOrder` fallback — use flow data only, show generic state if empty
- Lines 64-68: Remove `legacyOrder` arrays in `getNextStatus()` — use `getNextStatusForActor()` exclusively
- Line 137: Remove hardcoded `displayStatuses` fallback

### Task 2.3 — Update `useStatusLabels.ts`

- Add `getFlowStepLabel(step: StatusFlowStep): StatusLabel` that returns `{ label: step.display_label, color: step.color }` directly, falling back to existing `getOrderStatus()` only if `display_label` is null

### Task 2.4 — Update `OrderDetailPage.tsx`

- Line 109: Use flow step's `display_label` when available
- Lines 117-130: Replace hardcoded buyer hints with `step.buyer_hint` from the flow data. Fall back to current hardcoded hints for any step without a `buyer_hint`.

### Task 2.5 — Update `OrdersMonitor.tsx`

- Replace direct `ORDER_STATUS_LABELS` usage with `useStatusLabels().getOrderStatus()` hook

---

## Phase 3: Admin Workflow Manager UI

### Task 3.1 — Add nav item

In `AdminSidebarNav.tsx`, add `{ value: 'workflows', label: 'Workflows', icon: GitBranch }` to Commerce group.

### Task 3.2 — Create `AdminWorkflowManager.tsx`

**Main view:** List of all unique `(parent_group, transaction_type)` workflows from `category_status_flows`, showing name and status count.

**Workflow Editor (sheet):**
- Sortable status list with: `status_key`, `display_label`, `color`, `icon`, `actor`, `is_terminal`, `buyer_hint`
- Add/remove status rows
- **Transitions section**: For each status, show allowed next statuses with actor checkboxes (seller, buyer, delivery, system, admin). This supports non-linear transitions like cancellations.
- Save: upsert all rows for that workflow + corresponding transitions
- Duplicate workflow

**Category mapping view:** Shows which categories use which workflow via `parent_group`, allows reassignment.

### Task 3.3 — Wire into `AdminPage.tsx`

Add `{admin.activeTab === 'workflows' && <AdminWorkflowManager />}`

---

## Phase 4: Booking Flow + Calendar Fix

### Task 4.1 — Add review step to `ServiceBookingFlow.tsx`

Add `step` state: `'select'` → `'review'` → submitting. Review screen shows: service name, image, date/time, location, addons, price breakdown, notes. "Confirm" triggers order creation. "Back" returns to slot selection.

### Task 4.2 — Fix calendar fallback in `src/lib/calendar.ts`

Wrap native Capacitor call in try/catch, fall back to ICS download on failure.

---

## Files Summary

| Phase | File | Action |
|-------|------|--------|
| 1 | DB migration | Create `category_status_transitions`, alter `category_status_flows`, seed data, update trigger |
| 1 | DB data insert | Seed workflows for cart_purchase/self_fulfillment/buy_now + all transitions |
| 2 | `src/hooks/useCategoryStatusFlow.ts` | Extend interface, fix booking mapping, add transitions hook |
| 2 | `src/hooks/useOrderDetail.ts` | Remove all hardcoded fallbacks |
| 2 | `src/hooks/useStatusLabels.ts` | Add flow-step label method |
| 2 | `src/pages/OrderDetailPage.tsx` | Dynamic labels + buyer hints from flow |
| 2 | `src/components/admin/analytics/OrdersMonitor.tsx` | Use dynamic labels |
| 3 | `src/components/admin/AdminSidebarNav.tsx` | Add Workflows nav |
| 3 | `src/components/admin/AdminWorkflowManager.tsx` | **Create** |
| 3 | `src/pages/AdminPage.tsx` | Wire workflow tab |
| 4 | `src/components/booking/ServiceBookingFlow.tsx` | Add review step |
| 4 | `src/lib/calendar.ts` | Native fallback fix |

