

# QA Audit: 5 Critical Bugs in the Dynamic Workflow Implementation

## Pre-Fix Impact Analysis

If these bugs are fixed, the following modules are impacted:
- **Order list views** (OrdersPage, SellerOrderCard) — label rendering
- **Order detail page** — action bar OTP gating, seller CTA logic
- **Delivery flow** — OTP enforcement, actor-based permissions
- **Self-pickup flow** — false delivery UI elements
- **All workflow types** — consistent label resolution

---

## Bug 1: `useFlowStepLabels` Returns Non-Deterministic Labels (Cross-Workflow Contamination)

**Description:** The new `useFlowStepLabels` hook (line 24-26) fetches ALL rows from `category_status_flows` without filtering by `parent_group` or `transaction_type`. Since the same `status_key` (e.g., "placed") exists across 17 workflows with potentially different `display_label` values, the "first non-null" logic (line 35) picks whichever row the DB returns first — which has no `ORDER BY` and is therefore non-deterministic.

Example: If you set `display_label = "Order Received"` on `food_beverages/seller_delivery/placed` and `"Placedddddd"` on `default/self_fulfillment/placed`, the OrdersPage could show EITHER label regardless of which workflow the order actually belongs to.

**Why critical (buyer trust):** A buyer sees "Placedddddd" on their food delivery order list because the batch hook pulled the wrong workflow's label. This erodes confidence that the system knows what their order is doing.

**Affected modules:** `OrdersPage` (OrderCard), `SellerOrderCard`, any future consumer of `useFlowStepLabels`.

**Fix:**
- The batch hook cannot correctly resolve per-order labels without knowing each order's workflow. Two options:
  - **Option A (safe):** Keep the batch hook but add a priority: filter to only `default` parent_group labels (the canonical fallback). This ensures consistency.
  - **Option B (accurate):** Accept that list views need per-order context. Enrich each order query with `transaction_type` and pass it to a context-aware label resolver. More accurate but heavier.
- Recommended: **Option A** — filter query to `parent_group = 'default'` as baseline, then override at the detail page level (which already uses per-order flow).

**Fix risk:** Option A may show "default" labels instead of category-specific ones in lists. Acceptable because the detail page already shows correct labels. Option B risks N+1 queries.

---

## Bug 2: Hardcoded Terminal Status Check in OTP Gate Bypasses Workflow

**Description:** Lines 209-210 of `OrderDetailPage.tsx`:
```typescript
const sellerNextIsTerminal = o.nextStatus 
  ? isTerminalStatus(o.flow, o.nextStatus) || ['delivered', 'completed'].includes(o.nextStatus) 
  : false;
```
The `|| ['delivered', 'completed'].includes()` is a hardcoded fallback that overrides the workflow. If a workflow defines 'delivered' as a NON-terminal transit step (e.g., "delivered to gate, awaiting final handoff"), this code still treats it as terminal and forces OTP verification.

Similarly, `stepRequiresOtp` (line 232 of `useCategoryStatusFlow.ts`) has a hardcoded fallback:
```typescript
const DELIVERY_TERMINAL_STATUSES = ['delivered', 'completed'];
return DELIVERY_TERMINAL_STATUSES.includes(statusKey);
```
This fires when the flow hasn't loaded yet, forcing OTP even for workflows where OTP is disabled.

**Why critical (buyer trust):** The seller clicks the CTA button, gets forced into an OTP dialog that the workflow doesn't require, and is stuck because no OTP was ever generated. Buyer sees the order frozen with no explanation.

**Affected modules:** Seller action bar, buyer action bar, `DeliveryCompletionOtpDialog`, `stepRequiresOtp` utility.

**Fix:**
- Remove the hardcoded `['delivered', 'completed'].includes()` from lines 209-210. The `isTerminalStatus(o.flow, o.nextStatus)` check is sufficient when the flow is loaded.
- In `stepRequiresOtp`, change the fallback to `return false` instead of `return DELIVERY_TERMINAL_STATUSES.includes(statusKey)`. The DB trigger already enforces OTP at the backend — if the frontend incorrectly skips OTP, the backend will reject and the `delivery-otp-required` event handler (line 272) will auto-open the dialog as a safety net.
- Keep the `hasDeliveryOtpGate` check (line 208) as the backend safety net — it catches cases where frontend flow is stale.

**Fix risk:** If the flow is loading and a seller clicks quickly, they might attempt a non-OTP advance that the DB rejects. The existing error handler (line 272) already catches this and opens the OTP dialog. Zero user-facing risk.

---

## Bug 3: Seller `getNextStatus()` Hardcodes Actor List Instead of Using Workflow

**Description:** Lines 107-109 of `useOrderDetail.ts`:
```typescript
const sellerHandlesDelivery = deliveryHandledBy && deliveryHandledBy !== 'platform';
const actors = sellerHandlesDelivery ? ['seller', 'delivery'] : ['seller'];
const next = getNextStatusForActors(flow, order.status, actors, transitions);
```
This hardcodes which actors the seller can act as. If the workflow defines a step where ONLY `delivery` can act (not `seller`), but `deliveryHandledBy = 'seller'`, the code will still find a match via the `'delivery'` fallback. This means the seller sees a CTA for a step that should only be actionable by a dedicated delivery partner.

Conversely, if a future workflow defines a step where actor = `'seller,delivery'` (comma-separated), the transitions table might have separate entries for each. The code would find `seller` first and return, which is correct — but it breaks the principle of "workflow drives everything."

**Why critical (buyer trust):** For a platform-delivery order where the seller should NOT advance past "accepted" (the delivery partner should), the seller sees and can click "Mark Picked Up" — advancing the order incorrectly. The buyer sees "Picked Up" when the rider hasn't even arrived.

**Affected modules:** Seller action bar, `getNextStatusForActors`, any future actor-based action resolution.

**Fix:**
- Remove the hardcoded `['seller', 'delivery']` array. Instead, derive the actor list from the workflow:
  - Check if the current step's `actor` field includes 'seller' (via comma-separated parsing)
  - Check if the NEXT step's `actor` field includes 'seller' or if the transitions table has a seller transition
  - The transitions table is already the source of truth — `getNextStatusForActor(flow, status, 'seller', transitions)` will return null if no seller transition exists. So just always pass `['seller']` and let the transitions table decide.
- For self-delivery sellers, add 'delivery' to the actor list ONLY if the seller is the assigned delivery partner for this order (check `delivery_assignments.rider_id` = seller's user_id or a flag).

**Fix risk:** Sellers who are self-delivering might lose the ability to advance delivery steps if transitions aren't configured for both actors. Mitigation: ensure admin workflow editor auto-generates transitions for both 'seller' and 'delivery' when `deliveryHandledBy = 'seller'`.

---

## Bug 4: Self-Pickup Orders Show Delivery UI Elements

**Description:** Line 85 of `OrderDetailPage.tsx`:
```typescript
const hasDeliverySteps = o.flow.some((s: any) => s.is_transit === true);
const isDeliveryOrder = hasDeliverySteps || ['delivery', 'seller_delivery'].includes(fulfillmentType);
```
If an admin misconfigures a self_fulfillment workflow with `is_transit = true` on any step (before the warning/block was added, or if they dismiss the warning), `hasDeliverySteps` becomes true, and the order is treated as a delivery order. This triggers:
- Delivery assignment fetching (line 104-141) — unnecessary DB queries
- Buyer OTP card display (line 512) — confusing for pickup orders
- Delivery status card (line 520) — misleading
- GPS tracker rendering (line 508) — nonsensical for pickup

Additionally, the `hasDeliveryOtpGate` (line 208) becomes true if a delivery assignment somehow exists, forcing OTP on a pickup order.

**Why critical (buyer trust):** A self-pickup buyer sees "Your Delivery Code: 1234" and "Setting up live tracking..." on their order — but no one is delivering. Complete confusion. They might wait at home instead of going to pick up.

**Affected modules:** OrderDetailPage delivery section, `DeliveryStatusCard`, `LiveDeliveryTracker`, buyer OTP card, `SellerGPSTracker`.

**Fix:**
- Add a guard: `isDeliveryOrder` should ALSO check `fulfillmentType !== 'self_pickup'`. The workflow flags are additive context, but `fulfillmentType` is the ground truth for whether physical delivery occurs:
  ```typescript
  const isDeliveryOrder = fulfillmentType !== 'self_pickup' && 
    (hasDeliverySteps || ['delivery', 'seller_delivery'].includes(fulfillmentType));
  ```
- This ensures that even if a self_fulfillment workflow has misconfigured `is_transit` flags, the UI won't show delivery elements.

**Fix risk:** None — this is strictly a guard that prevents misconfiguration from leaking into the buyer experience. Self-pickup orders should never show delivery UI.

---

## Bug 5: Buyer Action Bar Skips OTP When `deliveryAssignmentId` Is Null But OTP Is Required

**Description:** Lines 658-669 of `OrderDetailPage.tsx`:
```typescript
(stepRequiresOtp(o.flow, o.buyerNextStatus) || (hasDeliveryOtpGate && buyerNextIsTerminal)) ? (
  deliveryAssignmentId ? (
    <Button ... onClick={() => setIsOtpDialogOpen(true)} ...>Verify & Confirm</Button>
  ) : (
    <Button ... onClick={() => o.buyerAdvanceOrder(o.buyerNextStatus!)} ...>
      {o.getFlowStepLabel(o.buyerNextStatus).label}
    </Button>
  )
)
```
When `deliveryAssignmentId` is null (assignment not yet created, or race condition during loading), the code falls through to the ELSE branch, which calls `buyerAdvanceOrder` directly — **bypassing OTP entirely**. The buyer can advance the order without OTP verification simply because the delivery assignment hasn't loaded yet.

This is a timing-dependent security hole: if the buyer clicks the CTA within the first 1-2 seconds before the assignment query resolves, they skip OTP.

**Why critical (buyer trust):** This is a security issue. OTP exists to prevent unauthorized delivery confirmation. A fast-clicking buyer (or a malicious actor) can bypass it by exploiting the race condition. The DB trigger should catch this, but the user experience is broken — they see a success toast followed by an error, which is confusing.

**Affected modules:** Buyer action bar, OTP enforcement, `verify_delivery_otp_and_complete` RPC.

**Fix:**
- When `stepRequiresOtp` returns true but `deliveryAssignmentId` is null, show a disabled/loading button instead of a direct advance button:
  ```typescript
  deliveryAssignmentId ? (
    <Button onClick={() => setIsOtpDialogOpen(true)}>Verify & Confirm</Button>
  ) : (
    <Button disabled>
      <Loader2 className="animate-spin" /> Preparing verification…
    </Button>
  )
  ```
- This matches the seller action bar behavior (line 636-639) which already shows a disabled "Preparing delivery verification…" button when assignmentId is null. The buyer bar should be consistent.

**Fix risk:** If the delivery assignment never loads (edge case: assignment creation failed), the buyer is stuck with a permanently disabled button. Mitigation: add a timeout (30s) that falls back to `buyerAdvanceOrder` and lets the DB trigger handle OTP enforcement.

---

## Summary: Files to Modify

| File | Bug(s) | Change |
|---|---|---|
| `src/hooks/useFlowStepLabels.ts` | #1 | Filter to `parent_group = 'default'` or add deterministic ordering |
| `src/pages/OrderDetailPage.tsx` | #2, #4, #5 | Remove hardcoded terminal checks; add self-pickup guard; fix buyer OTP race |
| `src/hooks/useCategoryStatusFlow.ts` | #2 | Change `stepRequiresOtp` fallback to `false` |
| `src/hooks/useOrderDetail.ts` | #3 | Remove hardcoded actor list; derive from workflow/transitions |

