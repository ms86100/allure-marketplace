

## Issue 1: Background/Closed App Notifications Not Delivered

**Root cause**: The `device_tokens` table is empty. Without a registered FCM token, the `send-push-notification` edge function has nowhere to send. The token registration code in `usePushNotifications.ts` is correct but has never successfully saved a token — likely because the native build hasn't included these recent code changes yet, or the RLS policy on `device_tokens` blocks the insert.

**What needs to happen (your side)**:
- Rebuild the native app with the latest code (`git pull → npm install → npm run build → npx cap sync → npx cap run ios`)
- After opening the app and logging in as the seller, check the Xcode console for `[Push]` logs — specifically look for `[Push] Token saved successfully` or `[Push] Token save FAILED`
- Share those logs — they will tell us exactly whether the token is being registered and saved

**What I will fix (code side)**:
- Verify the `device_tokens` table RLS allows authenticated users to insert/upsert their own tokens
- Add a fallback: if the token save fails due to RLS, log the exact error so we can diagnose immediately

**Important context**: Background push notifications are handled entirely by iOS/Android OS + FCM. The app code cannot "listen" while closed. The only mechanism is: FCM receives the message → OS displays a system notification → user taps it → app opens. This already works in our `send-push-notification` edge function (it sets `sound: "default"`, `priority: "high"`, proper APNs payload). The blocker is simply that no token exists in the database.

---

## Issue 2: Only One Order Shown Instead of All Pending Orders

**Root cause**: In `useNewOrderAlert.ts` line 167, the polling query uses `.limit(1)`. It only fetches the most recent actionable order. Additionally, `handleNewOrder` sets `pendingAlert` to a single order (line 63: `setPendingAlert(order)`), replacing any previous alert. The alert overlay (`NewOrderAlertOverlay`) only shows one order at a time.

**Fix**:
1. **Change polling to fetch ALL actionable orders** — remove `.limit(1)`, fetch all orders with actionable statuses
2. **Queue multiple alerts** — change `pendingAlert` from a single `NewOrder | null` to an array `NewOrder[]`, and process them sequentially (show one, dismiss reveals next)
3. **Force-refresh seller orders list on app resume** — ensure `useSellerOrdersInfinite` and `useSellerOrderStats` queries are invalidated when the app returns to foreground (add to `useAppLifecycle.ts`)

### Implementation Steps

**1. `src/hooks/useNewOrderAlert.ts`**:
- Change `pendingAlert` state from `NewOrder | null` to `NewOrder[]`
- Change `handleNewOrder` to append to the queue instead of replacing
- Remove `.limit(1)` from polling query, iterate all results
- `dismiss` pops the first item from the queue (reveals next)
- `snooze` removes current from queue, re-enables after timeout

**2. `src/components/seller/NewOrderAlertOverlay.tsx`**:
- Accept `orders: NewOrder[]` instead of `order: NewOrder | null`
- Show count badge ("3 new orders") when multiple are queued
- Display first order in queue; dismiss reveals next

**3. `src/App.tsx` (GlobalSellerAlert)**:
- Update to pass the array to the overlay

**4. `src/pages/SellerDashboardPage.tsx`**:
- Update to use array-based API from `useNewOrderAlert`

**5. `src/hooks/useAppLifecycle.ts`**:
- Add `seller-orders` and `seller-dashboard-stats` to the list of queries invalidated on app resume, so the full orders list refreshes when the seller opens the app

**6. `src/hooks/usePushNotifications.ts`**:
- Add a diagnostic log on mount that queries `device_tokens` to check if the current user has any saved tokens — helps debug the registration issue without needing Xcode

### Database verification needed
- Check RLS on `device_tokens` allows `INSERT` and `UPDATE` for `auth.uid() = user_id`

