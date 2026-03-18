

## Full System Audit: Silent Failures & UX Breakdowns

### Summary

After thorough code review across buyer, seller, and admin flows, here are the concrete bugs and issues found. Each is a real code-level problem — no speculative items.

---

### 1. Toast Notifications Without Unique IDs (Causes Duplicate Toasts)

**Severity:** High  
**Flow:** Buyer (Cart, Checkout), Seller (Settings, Products)  
**Root Cause:** Frontend — missing `{ id: '...' }` on toast calls  

**Affected files & lines:**

| File | Toast calls missing `id` |
|------|--------------------------|
| `src/hooks/useCart.tsx` | Lines 122, 125, 131, 133, 137, 155, 162 — all `toast.error()` and `toast.success()` calls have no `id` |
| `src/hooks/useOrderDetail.ts` | Lines 152, 158, 163 — status update toasts have no `id` |
| `src/hooks/useSellerSettings.ts` | Lines 96, 111, 113, 118, 119, 120, 143, 145 — all without `id` |
| `src/hooks/useSellerProducts.ts` | Lines 192-284 — ~12 toast calls without `id` |
| `src/hooks/useSellerApplication.ts` | Lines 227, 257, 284, 290-297, 330, 336 — all without `id` |

**Why dangerous:** Rapid taps on "Add to Cart" produce stacking toasts. Multiple seller settings saves produce overlapping success messages. With `visibleToasts={1}` this is partially mitigated, but toasts still queue and flash rapidly.

**Fix:** Add unique `id` to every toast call in these files. Pattern: `toast.success('Added to cart', { id: 'cart-add' })`.

---

### 2. Cart `addItem` Race Condition on Rapid Taps

**Severity:** High  
**Flow:** Buyer — Add to Cart  
**Root Cause:** Frontend — no debounce on `addItem`  

The `addItem` function does optimistic update then a DB read (`select quantity ... maybeSingle`) followed by conditional insert/update. Two rapid taps can both read `quantity=1`, both issue `update quantity=2`, resulting in lost increment.

**Reproduction:** Rapidly tap "Add to Cart" 3 times on the same product. Expected: quantity 3. Actual: quantity 2 (last write wins).

**Fix:** Either use `upsert` with `on_conflict` and `quantity + 1` via an RPC, or add a per-product mutex/debounce in `addItem`.

---

### 3. `useOrderDetail` Status Update Has No Optimistic Concurrency Guard

**Severity:** Medium  
**Flow:** Seller — Order Processing  
**Root Cause:** Backend — no `WHERE status = :old_status` guard  

`updateOrderStatus` (line 146) does `update({ status: newStatus }).eq('id', order.id)` but doesn't check current status. If two sellers (or a seller + an auto-cancel trigger) race, a cancelled order could be moved to `accepted`.

The DB trigger `fn_validate_order_status_transition` likely guards this, but the frontend doesn't pass old status for comparison. If the trigger doesn't exist or is permissive, this is a critical bug.

**Fix:** Add `.eq('status', order.status)` to the update query. Check affected rows — if 0, refetch and show "Order status has changed."

---

### 4. UPI Payment: `confirm_upi_payment` Called with `as any` Type Cast

**Severity:** Medium  
**Flow:** Buyer — UPI Payment  
**Root Cause:** Frontend — type mismatch  

Line 177-181 of `UpiDeepLinkCheckout.tsx`:
```typescript
const { error } = await supabase.rpc('confirm_upi_payment', {
  _order_id: orderId,
  _upi_transaction_ref: '',
  _payment_screenshot_url: screenshotUrl,
} as any);
```

The `as any` hides a potential type mismatch. The types file shows two overloads — one without `_payment_screenshot_url`. If the DB function signature doesn't match, this silently fails.

**Fix:** Verify the DB function signature matches. Remove `as any` and fix types properly.

---

### 5. Cart Stale Data After Product Price/Availability Change

**Severity:** Medium  
**Flow:** Buyer — Cart Page  
**Root Cause:** Frontend — 30s staleTime cache  

Cart query has `staleTime: 30 * 1000`. If a seller changes price or disables a product, the buyer sees stale data for up to 30 seconds. The checkout flow does a fresh price check, but the cart UI shows wrong prices during that window.

**Impact:** User sees ₹100, clicks checkout, gets "prices have changed" error. Confusing UX.

**Fix:** On the cart page specifically, set `refetchOnMount: 'always'` (already done) and reduce `staleTime` to 5s or add a refetch on window focus.

---

### 6. Seller Order Alert Polling Never Stops (Performance)

**Severity:** Low  
**Flow:** Seller — Dashboard  
**Root Cause:** Frontend — design choice  

`useNewOrderAlert` has an exponential backoff poll that "never terminates" (documented in memory). While intentional, if a seller leaves the app open overnight, it will make ~2,880 queries (one every 30s). Combined with realtime subscription, this is redundant.

**Impact:** Unnecessary DB load, battery drain on mobile.

**Fix:** Stop polling when document is hidden (`visibilitychange`). Resume on visible.

---

### 7. `handleRazorpayFailed` Cancels Orders Without Confirming User Intent

**Severity:** Medium  
**Flow:** Buyer — Razorpay Payment  
**Root Cause:** Frontend — auto-cancel on modal dismiss  

Line 325: When Razorpay modal is dismissed (user taps back, or network timeout), the code immediately cancels all pending orders. But the user may have completed payment — the webhook just hasn't arrived yet.

There's a recheck (line 323-324) but it only polls once. If the webhook is delayed by even 2 seconds, the order is cancelled despite successful payment.

**Fix:** Add a short delay (5s) or poll 3 times before cancelling. Show "Verifying payment..." state.

---

### 8. Missing Toast ID Deduplication in `useBuyerOrderAlerts` for `placed` Status

**Severity:** Low  
**Flow:** Buyer — Notifications  
**Root Cause:** Already fixed — `placed` is skipped (line 53), `pending` is skipped. But `STATUS_MESSAGES` doesn't include `placed` anyway, so the skip on line 53 for `pending` is the only real guard. If a new status is added to `STATUS_MESSAGES` without adding it to the skip list, it'll toast.

**Impact:** Low — defensive. No current bug.

---

### 9. Seller Settings: UPI Toggle Without UPI ID Allows Save but Breaks Checkout

**Severity:** High  
**Flow:** Seller → Buyer  
**Root Cause:** Frontend validation gap  

`useSellerSettings.handleSave` (line 120) validates: `if (formData.accepts_upi && !formData.upi_id.trim())` — this is correct. BUT the `seller_profiles.update` on line 131 sets `upi_id: formData.accepts_upi ? formData.upi_id.trim() : null`. 

The issue: if a seller previously had `accepts_upi=true` with a valid UPI ID, then edits something else and saves without touching UPI fields, the trim is fine. But if they toggle UPI off, save, then toggle back on and save WITHOUT entering a UPI ID — the validation catches it. **This is actually working correctly.** No bug here.

---

### 10. `updateOrderStatus` Toast Has No Unique ID

**Severity:** Medium  
**Flow:** Seller — Order Processing  
**Root Cause:** Frontend  

Line 152: `toast.success(...)` without `id`. If seller rapidly clicks "Next Status" button, multiple success toasts stack (mitigated by `visibleToasts={1}` but still queues).

**Fix:** Add `{ id: \`order-\${order.id}-update\` }`.

---

### Prioritized Fix Plan

**Phase 1 — Critical (do first):**
1. Add unique toast `id` to ALL toast calls in `useCart.tsx` (7 calls)
2. Add unique toast `id` to `useOrderDetail.ts` (3 calls)  
3. Add debounce/mutex to `useCart.addItem` for same product
4. Fix `handleRazorpayFailed` to poll multiple times before cancelling

**Phase 2 — High:**
5. Add unique toast `id` to `useSellerSettings.ts`, `useSellerProducts.ts`, `useSellerApplication.ts` (~25 calls)
6. Add `.eq('status', order.status)` guard to `updateOrderStatus`
7. Remove `as any` from `confirm_upi_payment` RPC call

**Phase 3 — Medium:**
8. Pause seller order polling when document hidden
9. Reduce cart staleTime on cart page

### Files to Change

| File | Changes |
|------|---------|
| `src/hooks/useCart.tsx` | Add toast IDs, add per-product addItem debounce |
| `src/hooks/useOrderDetail.ts` | Add toast IDs, add optimistic concurrency guard |
| `src/hooks/useCartPage.ts` | Fix Razorpay failure polling |
| `src/hooks/useSellerSettings.ts` | Add toast IDs |
| `src/hooks/useSellerProducts.ts` | Add toast IDs |
| `src/hooks/useSellerApplication.ts` | Add toast IDs |
| `src/hooks/useNewOrderAlert.ts` | Pause polling on visibility hidden |
| `src/components/payment/UpiDeepLinkCheckout.tsx` | Remove `as any` cast |

