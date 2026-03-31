

# 2 Critical Seller-Side Bugs — Pre-Production Audit

## Bug 1: Seller Dashboard Shows `payment_pending` Orders in "All" Tab

### Root Cause Analysis

The `useSellerOrdersInfinite` query (in `src/hooks/queries/useSellerOrders.ts`, lines 149-199) fetches ALL orders for the seller with no exclusion filter for `payment_pending`. The stats computation (`useSellerOrderStats`, line 89) correctly excludes `payment_pending` from all counts. But the actual order list query (used to render `SellerOrderCard` components) includes them.

The buyer-side order list (`useOrdersList.ts`, line 29) explicitly adds `.neq('status', 'payment_pending')`. This filter was never added to the seller-side query because the seller query was written separately as a performance-optimized infinite query, and the exclusion was accidentally omitted.

### Impact Assessment

- **Seller confusion**: A seller sees an order card on their dashboard for an order the buyer hasn't paid for. The order shows a "Pending" payment badge and an actionable status. The seller may start preparing the order before the buyer has committed.
- **Stats mismatch**: The dashboard stats (total orders, pending count) exclude `payment_pending`, but the order list includes them. The seller sees "2 orders" in stats but 3 cards in the list — a visible contradiction that erodes trust.
- **Affected flows**: Seller Dashboard orders tab, "today" filter (includes payment_pending orders created today), order card rendering, and the count displayed in the "All" filter tab.

### Reproduction Steps

1. As a buyer, add items to cart from a seller that supports UPI/Razorpay payment
2. Proceed to checkout and select online payment
3. At the payment confirmation step, close the app or navigate away — this creates an order with `status = 'payment_pending'`
4. Log in as the seller and open Seller Dashboard
5. The "All" orders tab shows this unpaid order as a visible card
6. Compare the order count badge on the "All" filter vs the number of cards — they may mismatch

### Reverse Engineering Analysis

**Impact of fix on other modules**:
- `useSellerOrderFilterCounts` — derives counts from `useSellerOrderStats`, which already excludes `payment_pending`. No change needed.
- `SellerOrderCard` — pure display component; unaffected.
- `useNewOrderAlert` — already filters by `ACTIONABLE_STATUSES` (`placed`, `enquired`, `quoted`) which excludes `payment_pending`. No conflict.
- Realtime subscriptions — the order channel subscribes to all order changes; the filter is applied at the query level. No conflict.

**Potential risks**:
1. If a seller explicitly needs to see `payment_pending` orders for some admin/debug purpose — this is not a valid use case; these orders are transient pre-payment states invisible to sellers.
2. Cursor-based pagination uses `created_at` — excluding rows mid-page could theoretically shift cursor boundaries, but since `payment_pending` orders are rare and the page size is 20, this is negligible.

### Implementation Plan

**File**: `src/hooks/queries/useSellerOrders.ts`

**Change**: In `useSellerOrdersInfinite` (line 156-158), after building the base query, add:

```typescript
query = query.neq('status', 'payment_pending');
```

This goes right after `.limit(PAGE_SIZE)` (line 158) and before the filter switch statement (line 164).

### Validation & Assurance

- **Unit test**: Query with a seller that has both `placed` and `payment_pending` orders → verify `payment_pending` is excluded from results.
- **Integration test**: Create a `payment_pending` order, load seller dashboard, verify order doesn't appear in any filter tab.
- **Regression check**: Verify stats counts still match visible order card count across all filter tabs.
- **Edge case**: Seller with ONLY `payment_pending` orders should see "No orders" empty state, not stale cards.

---

## Bug 2: Cart Retry Query Missing `daily_order_limit` — Checkout Bypass

### Root Cause Analysis

In `src/hooks/useCart.tsx`, the primary cart fetch query (line 110) includes `daily_order_limit` in the seller profile select:

```
...minimum_order_amount, daily_order_limit))
```

But the **retry query** (line 128) — which executes when the primary query returns zero items due to a transient PostgREST issue — has an older version of the select string that was never updated when `daily_order_limit` was added:

```
...minimum_order_amount))
```

This is a classic copy-paste regression. The retry path was added as a self-healing mechanism, and when `daily_order_limit` was later added to the primary query, the retry query was missed.

### Impact Assessment

- **Daily order limit bypass**: When the retry path triggers (transient PostgREST failure), the seller's `daily_order_limit` is `undefined` in the loaded cart data. The checkout flow in `useCartPage.ts` (line 470-481) checks `const dailyLimit = (group.items[0]?.product?.seller as any)?.daily_order_limit` — which resolves to `undefined`, causing the entire limit check to be skipped.
- **Seller overwhelm**: A seller who carefully set a limit of 5 orders/day can receive unlimited orders during the window when the retry path was used. They can't fulfill them, cancel them, and their cancellation rate increases.
- **Affected flows**: Cart loading, checkout validation, daily order limit enforcement.
- **Trigger frequency**: The retry path fires only on transient errors (PostgREST returning empty when rows exist). This is rare but has been observed enough to warrant the self-healing code. When it does fire, the limit enforcement silently disappears.

### Reproduction Steps

1. As a seller, set `daily_order_limit` to 1 in Seller Settings
2. As buyer A, place an order with that seller (order #1)
3. Simulate a transient PostgREST failure for buyer B's cart fetch (this is hard to reproduce deterministically — but the code path is verifiable by inspection: line 118 checks `filtered.length === 0 && items.length === 0` then retries)
4. If the retry path fires for buyer B, `daily_order_limit` is missing from the seller data
5. Buyer B's checkout proceeds without hitting the daily limit check
6. The seller receives order #2 despite having a limit of 1

**Code-level verification** (no external reproduction needed):
- Compare line 110 select string with line 128 select string — `daily_order_limit` is present in the former and absent in the latter. This is an objective, verifiable fact.

### Reverse Engineering Analysis

**Impact of fix on other modules**:
- `useCartPage.ts` — consumes the seller data from the cart query; will correctly receive `daily_order_limit` from both primary and retry paths after the fix.
- `minimum_order_amount` — already present in both queries; not affected.
- Cart rendering — unaffected; seller data display doesn't use `daily_order_limit`.

**Potential risks**:
1. Increasing the retry query's select string length marginally — negligible performance impact.
2. No functional risk — this is a strict additive fix to match the primary query.

### Implementation Plan

**File**: `src/hooks/useCart.tsx`

**Change**: Line 128 — add `daily_order_limit` to the retry select string:

```typescript
.select(`*, product:products(*, seller:seller_profiles(id, business_name, user_id, is_available, availability_start, availability_end, operating_days, profile_image_url, cover_image_url, primary_group, accepts_cod, accepts_upi, upi_id, fulfillment_mode, minimum_order_amount, daily_order_limit))`)
```

This makes the retry select string identical to the primary select string on line 110.

### Validation & Assurance

- **Static verification**: After the fix, diff line 110 and line 128 — they must be character-identical.
- **Integration test**: Force the retry path (mock PostgREST returning empty on first call), verify loaded cart items include `daily_order_limit` on the seller profile.
- **Regression check**: Primary cart fetch path is unchanged. Verify normal cart loading still works.
- **Edge case**: Seller with no `daily_order_limit` set — both paths return `null`, checkout proceeds normally (no limit enforced).

---

## Summary

| # | Bug | File | Confidence | Severity | Effort |
|---|-----|------|-----------|----------|--------|
| 1 | `payment_pending` orders visible in seller dashboard | `useSellerOrders.ts` | 100% | High — seller confusion, stats mismatch | ~2 min |
| 2 | Cart retry missing `daily_order_limit` — limit bypass | `useCart.tsx` | 100% | High — financial, seller overwhelm | ~1 min |

Both fixes are single-line changes. No schema changes, no refactoring, no new features.

