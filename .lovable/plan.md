

# Workflow Engine Integration — Deep Audit Report

## Critical Bugs

### C1: `OrderStatus` TypeScript type is missing workflow statuses
**File:** `src/types/database.ts:37`
**Severity:** Critical

The `OrderStatus` type is hardcoded and missing statuses used by the workflow engine: `requested`, `confirmed`, `rescheduled`, `no_show`, `at_gate`. The booking flow creates orders with `status: 'requested'` (`ServiceBookingFlow.tsx:184`), yet this isn't in the union type. Any code casting to `OrderStatus` or using it as a type guard will silently ignore these statuses.

**Impact:** TypeScript won't catch bugs where these statuses are compared. `statusOrder.indexOf(order.status)` returns `-1` for `requested`/`confirmed`/`rescheduled`/`no_show` orders, causing the timeline to render with no step highlighted.

**Fix:** Add `'requested' | 'confirmed' | 'rescheduled' | 'no_show' | 'at_gate'` to the `OrderStatus` union. Also add them to `ORDER_STATUS_MAP` (lines 323-340) so `useStatusLabels` fallback works.

---

### C2: `OrderCancellation` uses hardcoded cancellation eligibility
**File:** `src/components/order/OrderCancellation.tsx:42`
```
const canCancel = ['placed', 'accepted'].includes(orderStatus);
```
This ignores the workflow engine entirely. For service bookings, initial status is `requested` or `enquired` — buyers cannot cancel those orders through this component even though transitions exist. For any new workflow status added by an admin, cancellation won't be available.

**Fix:** Derive cancellation eligibility from `category_status_transitions` — check if a `buyer → cancelled` transition exists for the current status.

---

### C3: `getNextStatusForActor` only checks the immediately next step in sort order
**File:** `src/hooks/useCategoryStatusFlow.ts:93-108`

This function only looks at `flow[currentIndex + 1]` — the next step by `sort_order`. But transitions are not always linear. Example: a seller at `accepted` might need to jump to `preparing`, but if there's an intermediate `system`-actor step between them (e.g., `payment_confirmed`), the function returns `null` and the seller sees **no action button**.

The function also doesn't consult `category_status_transitions` at all — it uses the flow array position, which is presentation order, not transition logic.

**Fix:** Rewrite `getNextStatusForActor` to query `category_status_transitions` for valid next statuses where `allowed_actor` matches, not just the next sequential step.

---

### C4: `auto-cancel-orders` edge function uses `service_role` but trigger allows `cancelled` for service_role unconditionally
**File:** `supabase/functions/auto-cancel-orders/index.ts:67-74`

The edge function uses `service_role` key. The DB trigger at line `IF NEW.status::text = 'cancelled' THEN IF current_setting('role', true) = 'service_role' THEN RETURN NEW;` allows this. **This is correct.** However, the `auto_cancel_at` field is only set to `null` in the frontend `updateOrderStatus` (via `useOrderDetail.ts:101`), not in the edge function. This means `auto_cancel_at` persists on cancelled orders — minor data inconsistency.

---

### C5: Empty timeline when flow hasn't loaded yet
**File:** `src/hooks/useOrderDetail.ts:54-57`

When `flow.length === 0` (loading or no workflow found), `statusOrder` returns `[]` and `displayStatuses` returns `[]`. The timeline renders **nothing** — no loading state, no fallback. If the `category_status_flows` query is slow or fails, the order detail page shows a blank status section.

**Fix:** Show a skeleton/spinner while `isLoading` is true from `useCategoryStatusFlow`, or provide a minimal fallback array.

---

## Silent Failure Risks

### S1: `manage-delivery` edge function updates order status to `delivered` without actor context
**File:** `supabase/functions/manage-delivery/index.ts:355`

```typescript
await db.from('orders').update({ status: 'delivered' }).eq('id', assignment.order_id);
```

This runs with `service_role`, so the trigger allows it. But there's no `app.delivery_sync` setting set, so the actor enforcement check in the trigger may not match expectations. Currently safe because `service_role` bypasses the cancelled-only shortcut, and `delivered` transitions likely include `delivery` or `system` actors. **Low risk but fragile.**

---

### S2: `useOrderDetail.getNextStatus` checks `delivered` as terminal but trigger allows further transitions
**File:** `src/hooks/useOrderDetail.ts:62`

```typescript
if (!order || order.status === 'cancelled' || order.status === 'completed' || order.status === 'delivered') return null;
```

This hardcodes `delivered` as terminal. But the workflow engine marks `is_terminal` on specific steps. If a workflow has `delivered → completed` as a seller action (common for self-fulfillment to confirm completion), the seller won't see the button. The check should use `is_terminal` from the flow step instead.

---

### S3: Seller action bar hardcodes reject visibility
**File:** `src/pages/OrderDetailPage.tsx:236`

```tsx
{(order.status === 'placed' || order.status === 'enquired') && <Button ... onClick={() => o.setIsRejectionDialogOpen(true)}>Reject</Button>}
```

For `requested` status (service bookings), the reject button is hidden. The seller cannot reject a service request through the UI even though `requested → cancelled` transition exists in the DB.

---

### S4: `SellerOrderCard` hardcodes "Awaiting Pickup" override
**File:** `src/components/seller/SellerOrderCard.tsx:77-79`

```tsx
{order.fulfillment_type === 'delivery' && order.status === 'ready'
  ? 'Awaiting Pickup'
  : statusInfo.label}
```

This hardcoded label overrides the DB-driven `display_label`. Should use `seller_hint` or `display_label` from the flow.

---

### S5: `ORDER_STATUS_MAP` in `types/database.ts` is stale
**File:** `src/types/database.ts:323-340`

Missing entries for `requested`, `confirmed`, `rescheduled`, `no_show`, `at_gate`. Any component using `useStatusLabels()` fallback for these statuses gets "Unknown" label and gray styling.

---

## UI Inconsistencies

### U1: Timeline breaks for non-linear workflows
**File:** `src/pages/OrderDetailPage.tsx:100-113`

The timeline uses `statusOrder.indexOf(status)` to determine if a step is "completed". For workflows with backward transitions (e.g., `rescheduled` → `confirmed`), the order goes backwards, showing previously "completed" steps as incomplete.

### U2: `isInTransit` check is hardcoded
**File:** `src/pages/OrderDetailPage.tsx:62`

```tsx
const isInTransit = ['picked_up', 'on_the_way', 'at_gate'].includes(order.status);
```

Should derive from flow metadata (e.g., actor === 'delivery' steps).

### U3: `canChat` hardcodes terminal statuses
**File:** `src/hooks/useOrderDetail.ts:127`

```typescript
const canChat = order ? !['completed', 'cancelled'].includes(order.status) : false;
```

Should use `is_terminal` from the flow instead. `no_show` is terminal but chat stays enabled.

---

## Security Risks

### SEC1: Buyer cancellation bypasses transition validation partially
**File:** `src/components/order/OrderCancellation.tsx:65-72`

The cancellation updates the order with `.eq('buyer_id', user?.id)` — good for ownership. But the DB trigger validates the transition. If a `buyer → cancelled` transition doesn't exist for the current status, the trigger rejects it. However, the error handling shows a generic "Failed to cancel order" — not the specific "Invalid status transition" message. Users get confused.

### SEC2: No actor parameter passed to `updateOrderStatus`
**File:** `src/hooks/useOrderDetail.ts:99-118`

The function doesn't set `app.actor` or any session variable. The DB trigger checks `allowed_actor` but only enforces `delivery`/`system`-only restrictions. A buyer could theoretically call `updateOrderStatus` with a seller-only status — the trigger won't block it because it only restricts when **only** delivery/system actors are allowed. Any transition allowing `seller` OR `buyer` is open to both.

---

## Data Integrity Risks

### D1: Race condition in concurrent status updates
If seller clicks "Mark Preparing" while system auto-cancels, both updates hit the DB. The trigger validates each transition independently. The last write wins — order could end in `preparing` after auto-cancel or vice versa. No row-level lock on the order during status update.

### D2: Edge function `auto-cancel-orders` doesn't set `auto_cancel_at = null`
Cancelled orders retain `auto_cancel_at` timestamps. Future queries filtering by `auto_cancel_at IS NOT NULL` may incorrectly pick up already-cancelled orders (mitigated by `.eq("status", "placed")` filter, but fragile).

---

## Recommended Fixes (Priority Order)

| Priority | Issue | Fix |
|----------|-------|-----|
| P0 | C1 | Add missing statuses to `OrderStatus` type and `ORDER_STATUS_MAP` |
| P0 | C3 | Rewrite `getNextStatusForActor` to use `category_status_transitions` instead of array position |
| P0 | C2 | Derive cancellation eligibility from transitions table |
| P1 | S2 | Use `is_terminal` from flow instead of hardcoded status checks |
| P1 | S3 | Derive reject button visibility from transitions (any `→ cancelled` transition for seller) |
| P1 | C5 | Add loading/fallback state for empty flow |
| P1 | U3 | Use `is_terminal` for `canChat` check |
| P2 | S4-S5 | Add missing status labels, remove hardcoded overrides |
| P2 | U1-U2 | Derive transit/timeline logic from flow metadata |
| P3 | D1 | Add `SELECT ... FOR UPDATE` in trigger or use optimistic locking |
| P3 | SEC2 | Pass actor context via RPC or session variable for full enforcement |

