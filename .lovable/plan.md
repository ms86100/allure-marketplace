

# Fix Plan: 3 Production Issues

## Issue 1: Inconsistent Seller Notification Delivery

### Root Cause (Verified)

Two separate problems:

**A. Duplicate source in `razorpay-webhook/index.ts`**
`confirm-razorpay-payment` was already cleaned up (line 217: "Seller notification is handled by the DB trigger"). But `razorpay-webhook/index.ts` lines 196-222 still manually insert into `notification_queue` with `type: 'order'`. This creates a DUPLICATE alongside the DB trigger's `type: 'order_status'` entry.

The DB trigger coverage is verified complete:
- `trg_enqueue_order_notification` → AFTER UPDATE (Razorpay payment confirmation updates status to `placed`)
- `trg_enqueue_order_placed_notification` → AFTER INSERT with `status = 'placed'` (COD orders)
- Both triggers have 30-second dedup guards built in

Removing the webhook's manual insert is safe.

**B. State-mismatch guard kills valid "New Order" pushes**
In `process-notification-queue/index.ts` line 177:
```
if ((isStale && isTerminal) || isStateMismatch)
```
The `isStateMismatch` check fires independently. If an order auto-cancels within 3 minutes, the "New Order" push has `payload.status = 'placed'` but the DB shows `status = 'cancelled'` → push silently suppressed. The seller never knows the order existed.

### Fix

**File: `supabase/functions/razorpay-webhook/index.ts`**
- Remove lines 196-222 (manual seller notification insert). The DB trigger handles this.

**File: `supabase/functions/process-notification-queue/index.ts`** (line 177)
- Exempt `placed` and `enquired` statuses from the state-mismatch guard:
```typescript
const isNewOrderNotif = ['placed', 'enquired', 'requested'].includes(item.payload?.status);
if (((isStale && isTerminal) || isStateMismatch) && !isNewOrderNotif) {
```

**Idempotency is already guaranteed** by:
1. DB trigger's 30-second dedup window (checks existing queue entry with same `user_id` + `title` + `orderId`)
2. `queue_item_id` unique constraint on `user_notifications` (prevents duplicate in-app entries)

---

## Issue 2: Cancellation Message Says "You Cancelled" to Both Roles

### Root Cause
`OrderDetailPage.tsx` line 395-401 shows "You Cancelled This Order" for buyer-initiated cancellations regardless of who is viewing. Both buyer and seller see "You Cancelled This Order."

### Fix
**File: `src/pages/OrderDetailPage.tsx`** (lines 395-401)
Make the label role-aware:
```typescript
order.rejection_reason?.startsWith('Cancelled by buyer:')
  ? (o.isBuyerView ? 'You Cancelled This Order' : 'Cancelled by Buyer')
  : /not completed in time|seller didn't respond|payment was not completed/i.test(order.rejection_reason || '')
    ? 'Auto-Cancelled'
    : (o.isSellerView ? 'You Cancelled This Order' : 'Cancelled by Seller')
```

---

## Issue 3: iOS Background Location Missing `location` Background Mode

### Root Cause
`codemagic.yaml` lines 347-349 add `UIBackgroundModes` with only `remote-notification` and `fetch`. The `location` mode is missing, causing the Transistorsoft background geolocation plugin to fail with "plugin not implemented on iOS."

### Fix
**File: `codemagic.yaml`** — After line 349 and line 1240 (both iOS workflows):
```yaml
/usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:2 string location" App/Info.plist 2>/dev/null || true
```

---

## Summary

| # | Issue | File | Fix | Risk |
|---|-------|------|-----|------|
| 1a | Duplicate notification from webhook | `razorpay-webhook/index.ts` | Remove manual insert (lines 196-222) | Low — DB trigger verified for all paths |
| 1b | State-mismatch guard kills new-order pushes | `process-notification-queue/index.ts` | Exempt `placed`/`enquired`/`requested` from mismatch | Low — existing dedup prevents duplicates |
| 2 | "You Cancelled" shown to wrong role | `OrderDetailPage.tsx` | Role-aware label using `o.isBuyerView`/`o.isSellerView` | Zero — display only |
| 3 | Missing iOS `location` background mode | `codemagic.yaml` | Add `UIBackgroundModes:2 string location` | Low — requires rebuild |

## Validation
- Place 5 orders (mix COD + Razorpay) → seller receives ALL 5 push notifications
- Buyer cancels → seller sees "Cancelled by Buyer", buyer sees "You Cancelled This Order"
- Rapid cancel test: place order → auto-cancel within 3 min → seller still receives "New Order" push
- iOS rebuild → background location tracking works, no "not implemented" error

