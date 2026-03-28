

# Fix: Seller Notification Does Not Navigate to Correct Order

## Root Cause (3 cascading issues)

### Bug 1: Foreground toast has no tap action
When the seller has the app open and receives a push notification, the toast (line 424-431 in `usePushNotifications.ts`) shows the title/body but has **no `action`/`onClick` handler**. Tapping it does nothing. The seller then manually opens the orders page and gets lost in old orders.

### Bug 2: `resolveNotificationRoute` doesn't handle type `'order'`
The notification is created with `type: 'order'` (in `confirm-razorpay-payment` and `razorpay-webhook`). But `notification-routes.ts` only handles `order_created`, `order_status`, `order_update` — not bare `'order'`. If `data.route` is ever missing from the push payload, the fallback returns `/notifications` instead of `/orders/${orderId}`.

### Bug 3: Orders page defaults to "buying" tab
`OrdersPage` uses `defaultValue="buying"` for the tab. Even if the seller navigates to `/orders`, they land on "My Orders" — the new received order is hidden behind the "Received" tab.

## Fix Plan

### 1. Add tap-to-navigate on foreground toast
**File:** `src/hooks/usePushNotifications.ts` (lines 424-431)

Add an `action` with `onClick` to the sonner toast that navigates to `data.route` or the resolved notification route when tapped. This ensures the seller can tap the toast and go directly to the new order.

### 2. Fix route resolver for type `'order'`
**File:** `src/lib/notification-routes.ts`

Add `case 'order':` alongside `order_created` / `order_status` / `order_update` in the switch statement. This extracts `orderId` from the payload and returns `/orders/${orderId}`, falling back to `/orders` if no ID is available.

### 3. Smart tab selection on OrdersPage
**File:** `src/pages/OrdersPage.tsx`

When the page is reached via notification navigation (detectable via `location.state` or a query param), default the tab to `"selling"` instead of `"buying"` for dual-role users. This ensures the seller immediately sees received orders.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/usePushNotifications.ts` | Add `action` button/onClick to foreground toast for navigation |
| `src/lib/notification-routes.ts` | Add `case 'order':` to route resolver |
| `src/pages/OrdersPage.tsx` | Default to "selling" tab when navigated from a seller notification |

## Expected Result
- Seller taps foreground toast → lands on the exact order detail page
- Seller taps background notification → lands on the exact order detail page
- If seller manually opens orders list from notification context → "Received" tab is pre-selected
- Stale orders no longer obscure the new order because the seller bypasses the list entirely

