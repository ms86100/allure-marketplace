

# Pre-Order: Remaining Gaps for 100% Robustness

## Status Summary

| Gap | Description | Status |
|-----|-------------|--------|
| Gap 1 | Server-side guard in handlePlaceOrderInner | **Done** |
| Gap 2 | Cutoff time enforcement | **Done** |
| Gap 3 | ProductGridCard badge | **Done** |
| Gap 4 | Seller order list scheduled indicator | **Done** |
| Gap 5 | Cart data integrity | **Done** |
| Gap 6 | Seller notification with scheduled date | **Not done** |
| Gap 7 | Mixed cart handling | **Partially done** — client tracks `preorderSellerIds` but RPC still stamps `scheduled_date` on ALL seller orders |

---

## Gap 6: Seller notification missing scheduled date (Remaining)

**Problem:** When a pre-order is placed, the seller notification trigger (`fn_enqueue_order_status_notification`) builds the notification body from `category_status_flows.seller_notification_body` which has no knowledge of `scheduled_date`. The seller sees "New Order Received!" but has no idea it's scheduled for a future date without opening the order.

**Fix:**
- In the notification trigger function, after building `v_seller_body`, check if `NEW.scheduled_date IS NOT NULL`
- If so, append " Scheduled: [date] at [time]" to the body
- Also add `scheduled_date` and `scheduled_time_start` to the notification `payload` JSON so the frontend can render it

**File:** New migration SQL — update `fn_enqueue_order_status_notification` function

---

## Gap 7: Mixed cart — scheduled date applied to non-pre-order sellers (Remaining)

**Problem:** `preorderSellerIds` is computed on the client but never used. The RPC receives a single `_scheduled_date` and applies it to every order created in the loop. If a buyer has Seller A (pre-order, cakes) and Seller B (immediate, groceries), Seller B's order also gets a future `scheduled_date`, which is semantically wrong and confusing for Seller B.

**Fix (Option A — RPC-side, recommended):**
- Pass `preorderSellerIds` as a JSON array parameter to the RPC
- Inside the RPC's seller loop, only set `scheduled_date` and `scheduled_time_start` when the current seller_id is in the pre-order set; otherwise insert `NULL`
- This requires adding one new parameter `_preorder_seller_ids uuid[] DEFAULT NULL` to the RPC

**Fix (Option B — client-side, simpler but weaker):**
- If no items from a seller accept pre-orders, pass `NULL` for scheduled fields
- This means calling the RPC multiple times (once per seller group) which breaks the atomic multi-vendor pattern

**Recommendation:** Option A — single RPC call, per-seller logic inside.

**Files:**
- `src/hooks/useCartPage.ts` — pass `preorderSellerIds` array to RPC
- New migration — add `_preorder_seller_ids` parameter, conditionally apply schedule

---

## Implementation Plan

1. **Gap 7 — Mixed cart RPC fix** (20 min)
   - Add `_preorder_seller_ids uuid[] DEFAULT NULL` to `create_multi_vendor_orders`
   - In the seller loop: `CASE WHEN _seller_id = ANY(_preorder_seller_ids) THEN _scheduled_date ELSE NULL END`
   - Client: convert `preorderSellerIds` Set to array and pass to RPC

2. **Gap 6 — Notification enhancement** (15 min)
   - Update `fn_enqueue_order_status_notification` to append scheduled date info to seller notification body
   - Add `scheduled_date` to notification payload JSON

## Risk Assessment

- Gap 7 RPC change is backward-compatible: the new parameter defaults to `NULL`, and when `NULL`, all orders get the scheduled date as before (existing behavior preserved)
- Gap 6 is purely additive to notification content — no existing notification behavior changes
- Non-pre-order flows are completely unaffected (both params remain `NULL`)

