

# Audit: Hardcoded Status Values in Codebase

## Audit Results

### Category 1: Hardcoded Status Strings in Conditionals

**FAIL — 6 locations in production code (excluding tests/docs/auto-generated types)**

| File | Line(s) | Violation | Severity |
|------|---------|-----------|----------|
| `useOrderDetail.ts` | 47 | `order.status === 'placed'` for isUrgentOrder | Medium |
| `useOrderDetail.ts` | 142 | `status === 'completed' \|\| 'delivered'` for canReview check | High |
| `useOrderDetail.ts` | 189,192 | `status === 'completed' \|\| 'delivered'` for canReview/canReorder | High |
| `OrderDetailPage.tsx` | 189 | `order.status === 'placed'` for celebration banner | Medium |
| `OrderDetailPage.tsx` | 485,488 | `status === 'ready'`, `nextStatus === 'delivered'` for OTP intercept | High |
| `OrdersPage.tsx` | 28-29 | `status === 'completed' \|\| 'delivered'` for canReorder/isCompleted | High |

**Edge functions (backend — acceptable for system-level operations):**
- `auto-cancel-orders`: `status === 'placed'`, `status === 'delivered'` — these are system cron jobs operating on known lifecycle semantics. Acceptable but should ideally query flow config.
- `process-settlements`, `archive-old-data`, `monitor-stalled-deliveries`, `update-live-activity-apns`: Similar system-level status checks.

### Category 2: Frontend State Overrides

**FAIL — 1 location**

| File | Line | Violation |
|------|------|-----------|
| `OrderDetailPage.tsx` | 510 | `o.setOrder({ ...order, status: 'completed' })` — manually overrides status |

### Category 3: Static Status Label Mapping

**FAIL — 1 location (with DB fallback architecture)**

| File | Line | Violation |
|------|------|-----------|
| `types/database.ts` | 323-344 | `ORDER_STATUS_MAP` — hardcoded label/color mapping |
| `useStatusLabels.ts` | 67 | Uses DB config first, falls back to `ORDER_STATUS_LABELS` |

The fallback architecture is correct (DB → hardcoded), but the hardcoded map should be eliminated once DB config is guaranteed.

### Category 4: Stepper/Timeline UI

**PASS** — Timeline steps come from `getTimelineSteps(flow)` which reads from `category_status_flows` DB table.

### Category 5: Realtime Sync

**PASS** — `useOrderDetail` subscribes to `postgres_changes` on the orders table and calls `fetchOrder()` on every UPDATE event.

---

## Fix Plan

### Fix 1: Replace hardcoded `canReview` / `canReorder` with DB-driven `is_terminal`

The `category_status_flows` table marks `completed`, `delivered`, `cancelled`, `no_show` as `is_terminal = true`. We can use this: an order is "finished successfully" if its status is terminal AND not `cancelled`/`no_show`. This replaces hardcoded `=== 'completed' || === 'delivered'` checks.

**Files:** `useOrderDetail.ts`, `OrdersPage.tsx`

Add a helper `isSuccessfulTerminal(flow, status)` that returns true if the status is terminal and not in the "negative terminal" set (cancelled, no_show — these two are universal negative outcomes across all workflows).

For `canReview` and `canReorder`:
```
const canReview = isBuyerView && isSuccessfulTerminal(flow, order.status) && !hasReview;
const canReorder = isBuyerView && isSuccessfulTerminal(flow, order.status);
```

For the review-fetch guard in `fetchOrder` (line 142): same check.

### Fix 2: Replace hardcoded `isUrgentOrder` check

Currently: `order.status === 'placed'`. The real logic is: `auto_cancel_at` is set and not expired. The `placed` check is redundant since `auto_cancel_at` is only set on placed orders and cleared on status change.

**File:** `useOrderDetail.ts` line 47

Change to: `const isUrgentOrder = order?.auto_cancel_at && isSellerView;` — the `auto_cancel_at` being non-null already implies the order is in a state that can be auto-cancelled.

### Fix 3: Replace hardcoded OTP intercept in Seller Action Bar

**File:** `OrderDetailPage.tsx` lines 485, 488

The `status === 'ready'` check for platform delivery and `nextStatus === 'delivered'` for OTP intercept are flow-aware: `nextStatus` comes from the DB-driven transitions engine. The `'delivered'` string comparison is necessary to determine *which UI* to show (OTP dialog vs regular advance button). This is a **UI routing decision**, not a status lifecycle decision. However, we can make it DB-driven by checking if the next status step in the flow has `actor = 'delivery'` or by adding a `requires_otp` flag to the flow.

For now, the pragmatic fix: extract these to a helper that checks the flow step's properties rather than raw string comparison.

**Change:** Check if the flow step for `nextStatus` requires OTP by looking at a flow property (e.g., the status_key being a delivery terminal status with a delivery assignment). Since the flow data includes `actor`, we can check `flow.find(s => s.status_key === nextStatus)?.actor === 'delivery'` to determine if OTP verification is needed.

### Fix 4: Remove `setOrder` status override

**File:** `OrderDetailPage.tsx` line 510

The `onVerified` callback sets `status: 'completed'` manually. Since the RPC now atomically transitions to `completed` and the realtime subscription will refetch, we should trust the DB. Remove the manual override entirely — just close the dialog and let the realtime subscription handle the update.

### Fix 5: Replace celebration banner status check

**File:** `OrderDetailPage.tsx` line 189

`order.status === 'placed'` can be replaced by checking if the order's current status is the first non-terminal step in the flow (sort_order = minimum).

### Fix 6: Fix `OrdersPage.tsx` hardcoded checks

**File:** `OrdersPage.tsx` lines 28-29

The `OrderCard` component needs access to flow data to determine terminal status. Since loading flow per-card is expensive, we can use a simpler approach: add `is_terminal` check via the status flow. However, the orders list page doesn't load per-order flows.

**Pragmatic approach:** Create a lightweight hook `useTerminalStatuses()` that fetches all distinct terminal status_keys from `category_status_flows` once and caches it. Then `canReorder = terminalStatuses.has(order.status) && !negativeTerminals.has(order.status)`.

---

## Files to Modify

1. **`src/hooks/useCategoryStatusFlow.ts`** — Add `isSuccessfulTerminal()` helper and `useTerminalStatuses()` hook
2. **`src/hooks/useOrderDetail.ts`** — Replace 4 hardcoded checks with DB-driven helpers
3. **`src/pages/OrderDetailPage.tsx`** — Remove `setOrder` override, fix celebration banner, fix OTP intercept
4. **`src/pages/OrdersPage.tsx`** — Use `useTerminalStatuses()` for canReorder/isCompleted
5. **`src/test/helpers/business-rules.ts`** — Update `canReorder` to accept terminal set

