

# Round 12: 5 Critical Buyer-Facing Bugs

## Bug 1: Razorpay orders display as "UPI Payment" everywhere — misleading payment label

**Where:** `OrderDetailPage.tsx` line 321, `OrdersPage.tsx` line 67

**What happens:** The checkout now saves `payment_type = 'card'` for Razorpay payments (Round 8 fix). But both the order detail page and the orders list only check for `'cod'` and fall through to `'UPI Payment'` for everything else:

```typescript
// OrderDetailPage line 321
{((order as any).payment_method || (order as any).payment_type) === 'cod' ? 'Cash on Delivery' : 'UPI Payment'}

// OrdersPage line 67
{(order as any).payment_method === 'cod' ? 'COD' : 'UPI ✓'}
```

DB has 1 order with `payment_type = 'card'` already. All Razorpay orders show "UPI Payment" / "UPI ✓". Buyer paid via Razorpay but sees "UPI" — confusing and erodes trust.

Additionally, `OrdersPage` line 65 reads `payment_method` which doesn't exist in the DB — the column is `payment_type`. So the badge never renders for any order (the field is always undefined).

**Fix:**
- `OrderDetailPage.tsx` line 321: Add `'card'` → `'Online Payment'` mapping
- `OrdersPage.tsx` line 65-68: Fix column name to `payment_type` and add `'card'` label

**Impact:** Only display logic. No data changes. Two files, isolated renders.

---

## Bug 2: `OrdersPage` reads non-existent `payment_method` column — payment badge always empty

**Where:** `OrdersPage.tsx` line 65

**What happens:** The OrderCard component reads `(order as any).payment_method` but the DB column is `payment_type`. Since `payment_method` is always `undefined`, the entire payment badge block at lines 65-69 never renders. Buyers see no payment method indicator on any order in their list.

This was likely correct before a column rename and was never updated.

**Fix:** Change `payment_method` to `payment_type` on lines 65 and 67.

**Impact:** Same file as Bug 1 — combined into one edit. No other file references this display.

---

## Bug 3: `OrderCancellation` doesn't pass `_buyer_id` — RPC may fail or be exploitable

**Where:** `src/components/order/OrderCancellation.tsx` line 77

**What happens:** The `buyer_cancel_order` RPC call:
```typescript
const { error } = await supabase.rpc('buyer_cancel_order', {
  _order_id: orderId,
  _reason: `Cancelled by buyer: ${finalReason}`,
});
```

The RPC signature in the types file shows `_buyer_id` is an optional parameter. But NOT sending it means the function must rely entirely on `auth.uid()` internally. If the function was written to use the parameter when present and skip auth check when not, this is a privilege escalation risk. More practically — if the RPC requires `_buyer_id` for the advisory lock or validation, omitting it could cause intermittent failures under concurrency.

Looking at `BuyerCancelBooking.tsx` line 84, it DOES pass `_buyer_id: user.id`. The inconsistency means `OrderCancellation` may silently fail for some users.

**Fix:** Pass `_buyer_id: user.id` in the RPC call (same pattern as BuyerCancelBooking).

**Impact:** Single file edit. The `user` is already available via `useAuth()` in the component.

---

## Bug 4: Confirm dialog uses stale `finalAmount` after session restore — wrong total shown

**Where:** `src/pages/CartPage.tsx` line 345

**What happens:** When a buyer's app resumes from a Razorpay session, `pendingOrderIds` are restored and `showRazorpayCheckout` opens. The `RazorpayCheckout` component receives:
```typescript
amount={c.finalAmount || c.sessionAmount}
```

But if the cart was cleared (items=0), `c.finalAmount` computes to `0 + deliveryFee` (or just 0). The `||` operator correctly falls back to `c.sessionAmount`. However, `c.sellerGroups[0]?.sellerId` and `c.sellerGroups[0]?.sellerName` will be empty strings/undefined because cart is empty. The Razorpay modal shows the right amount but seller name shows empty or "Seller".

Similarly, the confirm dialog at line 334 shows `c.formatPrice(c.finalAmount)` which is 0 when cart is empty but session is active. If the buyer accidentally opens the confirm dialog during session restore, they see "Total: ₹0.00".

**Fix:** In CartPage line 334, use `c.finalAmount || c.sessionAmount` for the total display in the confirm dialog. Also guard the confirm dialog from opening when `items.length === 0 && hasActivePaymentSession`.

**Impact:** Only `CartPage.tsx`. The confirm dialog is already behind `showConfirmDialog` state.

---

## Bug 5: `handleRazorpayFailed` directly updates orders via `.update()` — bypasses RLS and workflow engine

**Where:** `src/hooks/useCartPage.ts` line 430

**What happens:** When Razorpay payment fails, the code cancels orders via:
```typescript
await supabase.from('orders').update({ status: 'cancelled' } as any)
  .eq('id', oid).eq('payment_status', 'pending').eq('buyer_id', user.id);
```

This direct `.update()` bypasses the `buyer_cancel_order` RPC which:
1. Validates workflow transitions
2. Fires the `enqueue_order_status_notification` trigger correctly
3. Sets `rejection_reason`
4. Uses advisory locks to prevent races

The direct update may fail silently if RLS blocks buyer updates to `status` (which it likely does — the system uses SECURITY DEFINER RPCs for a reason). Even if it works, no notification is sent to the seller, no rejection reason is recorded, and no audit trail exists.

The same bug exists in `handleUpiDeepLinkFailed` at line 477.

**Fix:** Replace direct `.update()` calls with `supabase.rpc('buyer_cancel_pending_orders', { _order_ids: pendingOrderIds })` which already exists in the types (line 8570-8572 of types.ts) and is designed for exactly this purpose — bulk-cancelling pending unpaid orders.

**Impact:** Only `useCartPage.ts`. The RPC `buyer_cancel_pending_orders` already exists and returns the count of cancelled orders.

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | Razorpay orders display as "UPI Payment" | **HIGH** — confusing | `OrderDetailPage.tsx`, `OrdersPage.tsx` |
| 2 | Payment badge reads wrong column name | **MEDIUM** — invisible feature | `OrdersPage.tsx` (same edit as #1) |
| 3 | OrderCancellation missing `_buyer_id` | **HIGH** — potential failures | `OrderCancellation.tsx` |
| 4 | Confirm dialog shows ₹0 during session restore | **MEDIUM** — trust erosion | `CartPage.tsx` |
| 5 | Failed payment cancels via raw UPDATE, not RPC | **CRITICAL** — bypasses RLS/workflow | `useCartPage.ts` |

## Files to Edit

- `src/pages/OrderDetailPage.tsx` — Bug 1 (payment label)
- `src/pages/OrdersPage.tsx` — Bugs 1+2 (column name + label)
- `src/components/order/OrderCancellation.tsx` — Bug 3 (add _buyer_id)
- `src/pages/CartPage.tsx` — Bug 4 (confirm dialog amount)
- `src/hooks/useCartPage.ts` — Bug 5 (RPC instead of raw update)

## Cross-Impact Analysis

- Bugs 1+2: Pure display changes, no data modification
- Bug 3: Adds one parameter to existing RPC call — no caller change needed
- Bug 4: Guards a UI element — no data flow change
- Bug 5: Replaces `.update()` with `.rpc()` — the RPC already exists and handles the same logic server-side. No new database objects needed.

