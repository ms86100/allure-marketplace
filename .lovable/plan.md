

## Root Cause Analysis — Order Status & Delivery Flow

### Investigation Results

After exhaustive analysis of the DB flows, transitions, triggers, client resolution logic, and live order data, here is what I found:

**The DB-driven workflow IS correct and operational.** The active order `4d068b29` is currently in `on_the_way` with a delivery assignment — proving the full delivery lifecycle works. However, there are **3 real bugs** that cause confusion and can break specific scenarios:

---

### Bug 1 (P0): `book_slot` vs `service_booking` Mismatch in DB Trigger

The `validate_order_status_transition` trigger (line 89) resolves enquiry orders in `classes`/`events` to `book_slot`, but no flows or transitions exist for `book_slot` — the client and all other code uses `service_booking`. This means **any status transition for class/event enquiry orders fails** with "Invalid status transition."

```text
Trigger (broken):  classes/events → 'book_slot'     ← NO flows exist
Client (correct):  classes/events → 'service_booking' ← flows exist
```

**Fix:** Change `'book_slot'` to `'service_booking'` in the trigger.

---

### Bug 2 (P1): `delivery_handled_by` NULL for All Existing Delivery Orders

All 16 existing delivery orders have `delivery_handled_by: NULL`. The resolution code handles this correctly (NULL → `seller_delivery`), but this creates a fragile dependency on COALESCE logic. The RPC now sets it correctly for NEW orders.

**Fix:** Backfill existing delivery orders: `UPDATE orders SET delivery_handled_by = 'seller' WHERE fulfillment_type = 'delivery' AND delivery_handled_by IS NULL`

---

### Bug 3 (P1): Missing `food_beverages/self_fulfillment` Flow + Transitions

The `food_beverages` parent group has flows for `cart_purchase` and `seller_delivery`, but NOT for `self_fulfillment`. Orders from food sellers with self-pickup fall back to `default/self_fulfillment` — which works, but means any customizations added to `food_beverages` (e.g., notification templates, display labels) don't apply.

**Fix:** Seed `food_beverages/self_fulfillment` flows and transitions matching the `default/self_fulfillment` pattern.

---

### What the User Likely Observed

The "placed → accepted → preparing → ready → completed" flow IS the correct `self_fulfillment` workflow for **self-pickup orders**. This is NOT a bug — it's the expected behavior when a seller's fulfillment mode doesn't include delivery. The delivery lifecycle (picked_up → on_the_way → delivered) only applies to delivery orders.

The confusion likely stems from:
- Testing with a self-pickup order and expecting delivery steps
- OR the timeline display showing 5 steps for pickup orders vs 7 for delivery orders

---

### Implementation Plan

**Single SQL migration** with 3 fixes:

| Fix | What | Risk |
|-----|------|------|
| Recreate `validate_order_status_transition` | Change `book_slot` → `service_booking` | Low — corrects mismatch |
| Backfill `delivery_handled_by` | SET 'seller' WHERE fulfillment_type='delivery' AND NULL | None — matches existing COALESCE behavior |
| Seed `food_beverages/self_fulfillment` | Insert flows + transitions | None — additive only |

**No client-side changes needed** — the frontend code is correct and fully DB-driven.

### Files Changed
| File | Change |
|---|---|
| SQL Migration | Fix trigger, backfill column, seed missing flow |

