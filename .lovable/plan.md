

# Two Fixes: Stop Bell on Order View + Meaningful Review Cart Modal

## Fix 1: Stop Notification Sound When Order is Opened

### Problem
The `useNewOrderAlert` hook's `dismissAll` is only accessible inside `GlobalSellerAlert` (App.tsx). When a seller navigates to an order detail page (e.g., from push notification), the bell keeps ringing because `OrderDetailPage` has no way to dismiss alerts.

### Solution
Create a lightweight React context to expose `dismissAll` globally, then call it from `OrderDetailPage` when the viewed order matches a pending alert.

**Changes:**

1. **New file: `src/contexts/NewOrderAlertContext.tsx`** — A context that exposes `dismissAll` and `dismissById(orderId)` functions.

2. **`src/App.tsx`** — Wrap the alert system in the new context provider. `GlobalSellerAlert` provides `dismissAll`/`dismissById` via context.

3. **`src/hooks/useNewOrderAlert.ts`** — Add a `dismissById` function that removes a specific order from `pendingAlerts` by ID, stopping the sound if no alerts remain.

4. **`src/pages/OrderDetailPage.tsx`** — On mount, call `dismissById(orderId)` from the context. This stops the bell immediately when the seller opens the order. Also dismiss when order status changes to a non-actionable status (e.g., accepted, preparing).

### Flow
```text
Push notification → User taps → OrderDetailPage mounts
  → useEffect calls dismissById(orderId)
  → pendingAlerts shrinks → if empty, stopBuzzing()
  → Bell stops immediately
```

## Fix 2: Meaningful "Review Cart" Experience

### Problem
The "Review Cart" button in the confirm dialog (`AlertDialogCancel`) just closes the dialog, showing the same checkout page — adds no value.

### Solution
Replace "Review Cart" with a proper review modal that shows a detailed, structured breakdown of the order before confirmation.

**Changes:**

1. **`src/pages/CartPage.tsx`** — Replace the `AlertDialogCancel` "Review Cart" button behavior:
   - Add a `showReviewModal` state
   - "Review Cart" opens a dedicated `Sheet` (bottom drawer) instead of just closing the dialog
   - The sheet displays:
     - **Items list**: Each item with name, variant, quantity, unit price, line total
     - **Per-seller subtotals** (for multi-seller carts)
     - **Pricing breakdown**: Subtotal, delivery fee, coupon discount, platform fee, taxes
     - **Fulfillment details**: Delivery address or pickup location
     - **Payment method**: COD/UPI/Online
     - **Scheduled delivery** info (if preorder)
     - **Total amount** prominently at bottom
   - A "Proceed to Confirm" button at the bottom that closes the sheet and re-opens the confirm dialog

### UX Flow
```text
User taps "Place Order" → Confirm dialog appears
  → User taps "Review Cart" → Dialog closes, Review Sheet slides up
  → Sheet shows full item-by-item breakdown with pricing
  → User taps "Looks Good, Confirm" → Sheet closes, confirm dialog re-opens
  → User taps "Confirm Order" → Order placed
```

## Files Changed

| File | Change |
|------|--------|
| New: `src/contexts/NewOrderAlertContext.tsx` | Context for global alert dismissal |
| `src/hooks/useNewOrderAlert.ts` | Add `dismissById` function |
| `src/App.tsx` | Wrap alert in context provider |
| `src/pages/OrderDetailPage.tsx` | Call `dismissById` on mount |
| `src/pages/CartPage.tsx` | Replace "Review Cart" cancel with a detailed review Sheet |

