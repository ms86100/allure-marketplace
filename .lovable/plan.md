

# P0 Fix: Workflow-Driven Order Lifecycle, Payment & Self-Pickup Issues

## Philosophy

Every fix below is driven by changes to the **workflow tables** (`category_status_flows`, `category_status_transitions`). The frontend already reads these tables dynamically — no hardcoding. We fix the data, and the UI follows.

---

## Current State (from DB)

**`self_fulfillment` transitions (default + food_beverages):**
- `placed` → `accepted` (seller) ✅
- `accepted` → `preparing` (seller) ✅  
- `preparing` → `ready` (seller) ✅
- `ready` → `completed` (seller) ✅
- `ready` → `completed` (**buyer**) ← **THIS IS THE BUG** (Issue 1)
- Various → `cancelled` (buyer/seller/admin) ✅

**`self_fulfillment` flow steps:**
`placed → accepted → preparing → ready → completed(terminal) → cancelled(terminal)`
- `completed` has `actor: seller` — correct, but the transitions table incorrectly allows buyer too.

---

## Issue 1 — Buyer Can Complete Order

**Root cause:** The `category_status_transitions` table has `buyer` as `allowed_actor` for `ready → completed` in `self_fulfillment` (both `default` and `food_beverages` parent groups).

**Fix (DB data change only):** Delete these two transition rows. The frontend (`getNextStatusForActor`) already dynamically queries transitions — removing the rows makes `buyerNextStatus` return `null` for `ready` status, and the buyer action bar button disappears automatically.

**SQL error (42883):** The `fn_enqueue_order_status_notification` trigger function casts `pr.category::service_category` on line 52. When `products.category` contains a value not in the `service_category` enum, the cast fails. Fix: change `cc.category = pr.category::service_category` to `cc.category::text = pr.category` (safe text comparison, matching `buyer_advance_order` RPC pattern).

### Changes:
1. **Data:** `DELETE` from `category_status_transitions` where `transaction_type='self_fulfillment'`, `from_status='ready'`, `to_status='completed'`, `allowed_actor='buyer'` (both parent groups)
2. **Migration:** Recreate `fn_enqueue_order_status_notification` with `cc.category::text = pr.category`

---

## Issue 2 — Buyer Confirmation After Self-Pickup

**Approach:** Add a new workflow step `buyer_received` between `ready` and `completed` for self-fulfillment. This makes it fully workflow-driven:

**New flow:** `placed → accepted → preparing → ready → buyer_received → completed`

- `ready` step: actor = `seller` (seller marks ready for pickup)
- `buyer_received` step: actor = `buyer` (buyer confirms they picked up)
- `completed` step: actor = `system`, terminal = true

**New transitions:**
- `ready → buyer_received` (seller) — seller hands over
- `buyer_received → completed` (buyer) — buyer confirms receipt

This way the buyer action bar automatically shows "Confirm Received" when status is `buyer_received`, driven entirely by DB data.

### Changes:
1. **Data:** Insert `buyer_received` step into `category_status_flows` for `self_fulfillment` (default + food_beverages)
2. **Data:** Update `ready → completed` seller transition to `ready → buyer_received` (seller)
3. **Data:** Insert `buyer_received → completed` (buyer) transition
4. **Data:** Update `completed` step sort_order to accommodate new step

---

## Issue 3 — COD Payment Status Stuck as "Pending"

**Approach:** Create a lightweight RPC `confirm_cod_payment` that sellers can call to mark COD payment as received. This updates `payment_status` → `'paid'` and sets `payment_confirmed_at`.

Additionally, when buyer confirms receipt (`buyer_received → completed` transition from Issue 2), if `payment_type = 'cod'`, the `buyer_advance_order` RPC should also set `payment_status = 'paid'`.

### Changes:
1. **Migration:** Create `confirm_cod_payment` RPC (security definer, validates caller is seller)
2. **Frontend:** Add a "Mark Payment Received" card for sellers on COD orders where `payment_status != 'paid'` and order is in terminal state. Reuse the existing `SellerPaymentConfirmation` pattern.
3. **New component:** `SellerCodConfirmation.tsx` — simple card calling the new RPC

---

## Issue 4 — UPI Screenshot Not Visible to Seller

**Root cause:** `SellerPaymentConfirmation` is gated by `status === 'payment_pending'`. For self-pickup UPI orders that have already moved past `payment_pending`, the screenshot is hidden.

**Fix:** Show a **read-only** payment proof section (screenshot + UTR) whenever `payment_screenshot_url` exists and seller is viewing, regardless of order status. The existing action buttons remain gated by `payment_pending` status.

### Changes:
1. **Frontend:** Add a read-only payment proof card in `OrderDetailPage.tsx` for sellers when `payment_screenshot_url` is present and order is NOT in `payment_pending` (since that case already shows the full confirmation UI)

---

## Files Changed

| File | Type | What |
|------|------|------|
| DB data (insert tool) | Data | Delete buyer→completed transitions, insert buyer_received steps + transitions |
| New migration SQL | Schema | Fix `fn_enqueue_order_status_notification` cast, create `confirm_cod_payment` RPC |
| `src/pages/OrderDetailPage.tsx` | Edit | Add read-only payment proof card, add COD confirmation card |
| `src/components/payment/SellerCodConfirmation.tsx` | New | COD payment confirmation component |

---

## Validation

All fixes are **workflow-driven**:
- Issue 1: Removing a DB transition row → UI automatically hides buyer complete button
- Issue 2: Adding new flow step + transitions → UI automatically shows buyer confirm action
- Issue 3: New RPC + small UI card for explicit COD confirmation
- Issue 4: Frontend display logic fix for existing data

No hardcoded status checks added. The `getNextStatusForActor`, `buyerNextStatus`, and action bar rendering all read from DB transitions dynamically.

