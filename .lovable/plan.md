

## Analysis: "Did you receive your order?" on Ready Status (Self-Pickup Flow)

### What workflow is this?

This is the **self-pickup / self-fulfillment** workflow: `Placed → Accepted → Preparing → Ready → Completed`.

The order's `fulfillment_type` is **pickup** (not delivery). The status text "Your order is ready for pickup!" confirms this.

### When does the "Did you receive my order?" prompt appear?

It appears whenever ALL of these are true (line 417 of `OrderDetailPage.tsx`):
- Buyer is viewing the order
- Order is NOT a delivery order
- `buyerNextStatus` exists (DB says buyer can advance)
- Order is not yet terminal

At **Ready** status, the DB transitions say the **buyer** is the actor who advances to `completed`. So `buyerNextStatus = 'completed'`, and the prompt appears.

### Is this correct behavior?

**Partially.** The prompt IS the mechanism for the buyer to advance `ready → completed`. It's not supposed to appear AFTER completed — it's how you GET to completed.

### What's actually wrong (two bugs):

**Bug 1 — Duplicate actions.** Both the `BuyerDeliveryConfirmation` card ("Yes, I received my order") AND the bottom Buyer Action Bar button appear simultaneously. They do the same thing — advance to `completed`. This is confusing and redundant.

**Bug 2 — Wrong wording for pickup.** The card says "Did you receive your order?" and "Yes, I received my order" — this implies delivery. For self-pickup orders, it should say "Have you picked up your order?" / "Yes, I picked up my order".

### Proposed Fix

**File: `src/pages/OrderDetailPage.tsx`**
- Remove the `BuyerDeliveryConfirmation` component entirely from the page. The bottom Buyer Action Bar already handles this transition with the correct DB-driven label. Having two UI elements for the same action is redundant and confusing.
- The action bar button (line 624) already uses `o.getFlowStepLabel(o.buyerNextStatus)` which pulls the correct label from the workflow DB — this is the single source of truth.

**Alternative (if you prefer keeping the prominent card):**
- Keep `BuyerDeliveryConfirmation` but make it fulfillment-aware:
  - Pickup orders: "Have you picked up your order?" / "Yes, I picked it up"
  - Non-delivery orders with other flows: current wording
- Hide the duplicate button in the action bar when the confirmation card is visible

### Recommendation

Remove `BuyerDeliveryConfirmation` and rely solely on the Buyer Action Bar. It's already DB-driven, uses correct labels, and is the canonical way to advance order status. One action, one button, zero confusion.

### Files to change

| File | Change |
|---|---|
| `src/pages/OrderDetailPage.tsx` | Remove `BuyerDeliveryConfirmation` block (lines 415-423) |

