

## Fix Toast Notification Noise & Overlap

### Root Cause Analysis

There are **3 independent toast sources** that fire simultaneously for order status changes:

1. **`useBuyerOrderAlerts.ts`** — Realtime Postgres listener on `orders` table. Fires a sonner toast for every status change (accepted, preparing, ready, etc.)
2. **`usePushNotifications.ts`** — Foreground push notification listener. Shows a sonner toast when a push arrives while app is open
3. **`useCartPage.ts`** — Direct toast calls during order placement flow (success, error, validation)

When an order is placed or status changes, sources 1 + 2 fire nearly simultaneously, creating stacked/overlapping toasts. Source 3 adds more during checkout.

### Plan

#### 1. Deduplicate realtime alerts with push notifications

**File: `src/hooks/useBuyerOrderAlerts.ts`**

- Add `toast.dismiss()` before showing new toast to prevent stacking
- Use unique toast IDs per order+status: `toast(msg.title, { id: \`order-\${orderId}-\${newStatus}\`, ... })`
- This ensures if push notification already showed the same update, sonner deduplicates by ID

**File: `src/hooks/usePushNotifications.ts`** (line ~344)

- Use the same ID pattern for order-related push toasts: extract `order_id` and `status` from notification data, use `{ id: \`order-\${orderId}-\${status}\` }`
- Non-order notifications keep random IDs (no change)

#### 2. Suppress mid-flow realtime toasts during active checkout

**File: `src/hooks/useBuyerOrderAlerts.ts`**

- Skip toast for status `pending` (just created, user already knows)
- Skip toast if user is currently on the cart page (placing order) — check `window.location.hash.includes('/cart')`

#### 3. Limit visible toasts globally

**File: `src/components/ui/sonner.tsx`**

- Add `visibleToasts={1}` prop to the Sonner `<Toaster>` — only 1 toast visible at a time, newer replaces older
- Add `gap={8}` for clean spacing if multiple allowed later

#### 4. Add unique IDs to all cart/checkout toasts

**File: `src/hooks/useCartPage.ts`**

- Already partially done. Ensure ALL toast calls use unique IDs:
  - `toast.success('Order placed...', { id: 'order-placed' })`
  - `toast.error('...unavailable...', { id: 'checkout-validation' })`
  - etc.

#### 5. Smooth toast animations (already built-in)

Sonner already has smooth enter/exit animations. Setting `visibleToasts={1}` with `position="bottom-center"` ensures clean, non-overlapping display. No custom animation code needed.

### Files to Change

| File | Change |
|------|--------|
| `src/components/ui/sonner.tsx` | Add `visibleToasts={1}` to limit stacking |
| `src/hooks/useBuyerOrderAlerts.ts` | Add unique toast IDs per order+status, skip during checkout |
| `src/hooks/usePushNotifications.ts` | Use matching toast IDs for order push notifications |
| `src/hooks/useCartPage.ts` | Ensure all toasts have unique IDs |

### What This Achieves

- Only 1 toast visible at a time — no overlap with UI elements
- Duplicate alerts from realtime + push are deduplicated by ID
- Cart page doesn't show redundant "order created" alerts
- Existing sonner animations provide polished transitions
- No breaking changes to notification history or push delivery

