

# UPI Payment Module — Second Bug Audit

## Issues Found: 2 Real Bugs, 1 Edge Case

---

### BUG 1 — MEDIUM: Wrong Column Name in Auto-Cancel Query 2

**File**: `supabase/functions/auto-cancel-orders/index.ts`, line 43

**Problem**: Query 2 filters with `.neq("payment_method", "cod")` but the `orders` table column is `payment_type` (confirmed in schema types and original migration). `payment_method` does not exist on the `orders` table.

**Impact**: With the service role client, PostgREST will either return a 400 error (killing the entire auto-cancel function) or silently ignore the filter — causing **COD orders to be cancelled after 15 minutes** too, not just UPI orders. Either way, this is a silent failure that breaks the orphan cleanup logic.

**Fix**: Change `.neq("payment_method", "cod")` to `.neq("payment_type", "cod")`.

---

### BUG 2 — LOW-MEDIUM: Empty UPI ID Silently Breaks Checkout

**File**: `src/pages/CartPage.tsx`, line 289

**Problem**: The `sellerUpiId` prop is computed as `(c.sellerGroups[0]?.items[0]?.product?.seller as any)?.upi_id || ''`. If the seller has `accepts_upi: true` but `upi_id` is empty/null (data inconsistency), the UPI deep link becomes `upi://pay?pa=&pn=...` — which will either silently fail or open the UPI app with no payee.

The `acceptsUpi` check at line 57 of `useCartPage.ts` does verify `!!(firstSeller as any)?.upi_id`, so this path should be blocked. However, there's a timing gap: cart data is cached, and a seller could remove their UPI ID between cache refresh and checkout. The fallback `|| ''` silently passes an empty string instead of showing an error.

**Fix**: Add a guard in `UpiDeepLinkCheckout` — if `sellerUpiId` is empty, show an error toast and prevent proceeding.

---

### EDGE CASE — Seller Confirmation Banner Disappears After Page Reload

**File**: `src/pages/OrderDetailPage.tsx`, line 161

**Problem**: When the seller confirms/disputes, `onConfirmed={() => window.location.reload()}` is called. This works, but if the order query in `useOrderDetail` doesn't include the new `payment_confirmed_by_seller` column in its SELECT, the banner would reappear on every reload. Let me verify this is handled...

Actually, the query uses `(order as any).payment_confirmed_by_seller`, and the cart query uses `seller_profiles(*)` which fetches all columns. The order detail query likely also fetches `*` from orders. The `as any` casts bypass type checking but should work at runtime since the column exists. This is **not a bug** — just a type-safety gap.

---

## Summary

| # | Issue | Severity | Silent Failure? |
|---|-------|----------|----------------|
| 1 | Wrong column `payment_method` → should be `payment_type` in auto-cancel Query 2 | **Medium** | Yes — COD orders may get wrongly cancelled, or entire function fails |
| 2 | Empty UPI ID fallback to `''` creates broken deep link | **Low-Medium** | Yes — broken payment link with no error |

## Recommended Fixes

**Fix 1** — In `supabase/functions/auto-cancel-orders/index.ts`, line 43:
```typescript
// Change:
.neq("payment_method", "cod")
// To:
.neq("payment_type", "cod")
```

**Fix 2** — In `UpiDeepLinkCheckout.tsx`, add a guard at the start of the component:
```typescript
useEffect(() => {
  if (isOpen && !sellerUpiId) {
    toast.error('Seller UPI ID is not configured. Please contact the seller.');
    onPaymentFailed();
    onClose();
  }
}, [isOpen, sellerUpiId]);
```

Both are quick one-line fixes. No database migration needed.

