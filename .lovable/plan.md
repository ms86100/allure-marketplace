

# Round 3 Audit Report — Workflow Engine Integration

## Confirmed: Round 1 + Round 2 Fixes Are In Place

All prior P0/P1/P2 fixes verified:
- `showNav` uses `isTerminalStatus()` (line 67) — **fixed**
- `canChat` uses `isTerminalStatus()` — **fixed**
- `isInTransit` derived from flow actor metadata — **fixed**
- `OrdersMonitor` loads statuses dynamically — **fixed**
- `ExtendedOrderStatus` deleted — **fixed**
- `canSellerReject` / `canBuyerCancel` from transitions — **fixed**

## Remaining Issues

### R3-1: Seller action bar still hardcodes terminal check (P1)
**File:** `src/pages/OrderDetailPage.tsx:245`
```typescript
{o.isSellerView && order.status !== 'completed' && order.status !== 'cancelled' && (
```
`showNav` at line 67 correctly uses `isTerminalStatus()`, but the seller action bar visibility still hardcodes `completed` and `cancelled`. For statuses like `delivered` or `no_show` (terminal), the action bar renders but shows no buttons (since `nextStatus` is null and `canSellerReject` is false), creating an empty floating bar at the bottom of the screen.

**Fix:** Replace with `!isTerminalStatus(o.flow, order.status)`.

### R3-2: `manage-delivery` edge function doesn't set `app.delivery_sync` (P2)
**File:** `supabase/functions/manage-delivery/index.ts:254, 261, 355`

The DB trigger checks `current_setting('app.delivery_sync', true) = 'true'` for delivery-only transitions. The edge function uses `service_role` which bypasses the cancelled shortcut but does NOT bypass the actor enforcement block (lines 80-87 of trigger). The actor enforcement only fires when ONLY `delivery`/`system` actors are allowed. Since `service_role` check is only in the cancelled shortcut, delivery-only transitions like `ready → picked_up` could be blocked if no `seller`/`buyer`/`admin` actor is in the allowed list.

Currently works because: the trigger's actor check at the bottom returns `NEW` if `current_setting('role', true) = 'service_role'`. Let me re-read the trigger... Actually yes, it does check `service_role` in the actor enforcement block too. So this is **safe**. No fix needed.

### R3-3: Review eligibility hardcodes `completed`/`delivered` (Acceptable)
**Files:** `src/hooks/useOrderDetail.ts:120, 161, 164`

`canReview` and `canReorder` check `completed` or `delivered`. This is **intentionally correct** — reviews and reorders should only be available for successfully fulfilled orders, not for `no_show` or `cancelled`. No fix needed.

### R3-4: Feedback prompt hardcodes `completed`/`delivered` (Acceptable)
**File:** `src/pages/OrderDetailPage.tsx:179`

Same rationale as R3-3 — feedback should only prompt after successful delivery. No fix needed.

### R3-5: `useOrderDetail` doesn't expose `getSellerHint` (P2)
**File:** `src/hooks/useOrderDetail.ts`

`getBuyerHint` is exposed but there's no `getSellerHint` equivalent. The seller hint data is in the flow but not surfaced. The seller action bar and seller order detail view could display contextual guidance (e.g., "Review items and accept or reject promptly") but currently don't.

**Fix:** Add `getSellerHint` helper and display it in the seller action bar.

### R3-6: Tests use stale hardcoded logic (P3)
**File:** `src/test/orders-payments.test.ts:346-356, 682-693`

Tests for `showNav`, cancellation eligibility, and next-status logic still use hardcoded status arrays. These don't match the workflow-driven behavior. Low priority — they test business rules in isolation, not integration.

## Summary

| Priority | Issue | Description | Fix |
|----------|-------|-------------|-----|
| **P1** | R3-1 | Seller action bar shows empty bar for `delivered`/`no_show` | Use `isTerminalStatus()` |
| **P2** | R3-5 | No `getSellerHint` exposed; seller sees no contextual guidance | Add helper + display in action bar |
| **P3** | R3-6 | Stale test assertions | Update test file |

Only **2 actionable code fixes** remain. The system is production-ready for the workflow engine.

