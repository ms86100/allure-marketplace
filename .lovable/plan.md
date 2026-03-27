

# Pre-Order Gap Analysis & Bulletproof Fix Plan

## What's Already Implemented (Working)

| Component | Status |
|-----------|--------|
| Seller product form (accepts_preorders, lead_time_hours) | Done |
| PreorderDatePicker component in checkout | Done |
| Cart page shows picker when pre-order items detected | Done |
| "Place Order" button disabled when schedule missing | Done |
| Scheduled date/time passed to RPC | Done |
| RPC writes scheduled_date/scheduled_time_start to orders table | Done |
| Pre-order badge on ProductListingCard | Done |
| Pre-order badge on ProductDetailSheet | Done |
| Scheduled date visible on OrderDetailPage (buyer + seller) | Done |

## What's Missing (7 Gaps)

### Gap 1: No server-side guard in handlePlaceOrderInner (CRITICAL)
The "Place Order" button is disabled via UI, but `handlePlaceOrderInner()` has **no explicit guard** rejecting pre-order carts without a schedule. If the button state is bypassed (race condition, programmatic call), the order goes through without a scheduled date.

**Fix:** Add early return guard in `handlePlaceOrderInner`:
```typescript
if (hasPreorderItems && (!scheduledDate || !scheduledTime)) {
  toast.error('Please select a delivery date & time for pre-order items.');
  return;
}
```
**File:** `src/hooks/useCartPage.ts` (after line 368)

---

### Gap 2: preorder_cutoff_time not enforced (MEDIUM)
The `category_config` table has a `preorder_cutoff_time` field (e.g., "18:00") and `products` table also has it. The `PreorderDatePicker` currently only enforces `lead_time_hours` but ignores the cutoff time. If a seller sets cutoff at 6PM, buyers should not be able to select times after 6PM.

**Fix:** Accept optional `cutoffTime` prop in `PreorderDatePicker`. Filter out time slots that exceed the cutoff on any given day. Pass the value from `useCartPage` after reading it from cart item products.

**Files:** `src/components/checkout/PreorderDatePicker.tsx`, `src/hooks/useCartPage.ts`

---

### Gap 3: ProductGridCard has no pre-order badge (LOW)
`ProductListingCard` shows a pre-order badge, but `ProductGridCard` (used in some layouts) does not.

**Fix:** Add the same badge logic to `ProductGridCard`.

**File:** `src/components/product/ProductGridCard.tsx`

---

### Gap 4: Seller order list has no scheduled date indicator (MEDIUM)
The `OrderDetailPage` shows the scheduled date, but the seller's **order list** (the table/cards showing all orders) has no indicator that an order is scheduled for a future date. Sellers scanning their order list won't know which ones are pre-orders at a glance.

**Fix:** Add a small "📅 Scheduled: Mar 28" badge on the seller order list card when `scheduled_date` is present.

**File:** Seller order list component (likely in `src/components/seller/` or `src/pages/SellerOrdersPage.tsx`)

---

### Gap 5: Cart items may not carry accepts_preorders/lead_time_hours (MEDIUM)
`useCartPage.ts` reads `(item.product as any)?.accepts_preorders`. The cart query in `useCart.tsx` does `select(*, product:products(*))` which **should** include these fields since they exist on the products table. However, this relies on `*` always expanding to include all columns. If the query ever changes to explicit columns, this breaks silently.

**Fix:** Verify the cart query returns these fields. Add a defensive fallback: if `hasPreorderItems` is false but we detect pre-order products in the fresh validation query (line 400), warn the user.

**File:** `src/hooks/useCartPage.ts`

---

### Gap 6: No seller notification about scheduled fulfillment time (LOW)
When a pre-order is placed, the seller gets a standard "New Order" notification but it doesn't mention the scheduled date. The seller needs to open the order detail to see when to prepare.

**Fix:** When `scheduled_date` is present, append it to the notification body: "New order scheduled for Mar 28 at 14:00".

**File:** The notification trigger/edge function that sends order notifications.

---

### Gap 7: No mixed-cart validation for pre-order + immediate items (LOW-MEDIUM)
A buyer can add both pre-order items (from Seller A) and immediate items (from Seller B) to the same cart. The scheduled date would then be applied to ALL orders including the immediate one, which is semantically wrong. Alternatively, the immediate seller gets an order with a future date they didn't expect.

**Fix:** Two approaches:
- **Option A (simpler):** Apply scheduled_date only to orders whose seller has pre-order items. Non-pre-order seller orders get `null`.
- **Option B (stricter):** Warn/block mixing pre-order and non-pre-order sellers in the same cart.

Recommend **Option A** — modify the RPC call to send per-seller scheduled dates, or handle in the client by splitting the logic.

**Files:** `src/hooks/useCartPage.ts`, possibly the RPC

---

## Implementation Order

1. **Gap 1** — Server-side guard (critical safety net, 5 min)
2. **Gap 5** — Verify cart data integrity (defensive, 10 min)
3. **Gap 2** — Cutoff time enforcement (functional completeness, 20 min)
4. **Gap 4** — Seller order list indicator (seller visibility, 15 min)
5. **Gap 3** — ProductGridCard badge (UI consistency, 5 min)
6. **Gap 7** — Mixed cart handling (data integrity, 30 min)
7. **Gap 6** — Notification enhancement (polish, 15 min)

## Risk Assessment

All changes are additive. No existing behavior is modified for non-pre-order flows. The RPC already defaults `_scheduled_date` to `NULL`, so non-pre-order orders are completely unaffected.

