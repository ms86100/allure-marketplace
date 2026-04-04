

## Emergency DB Recovery — Kill All Load Amplifiers

### Why OTP verify fails
The "Server busy. Please tap Verify again." is not an OTP bug. MSG91 verifies the code successfully. Then the edge function calls `adminClient.auth.admin.generateLink()` which needs the database. The database returns 544 (connection timeout). There is **no code workaround** — auth requires the DB. The only path is to **let the DB recover** by stopping everything that's hitting it.

### What's still hammering the DB right now

| Source | Interval | Impact |
|--------|----------|--------|
| `ResidentConfirmation.tsx` polling | **5 seconds** | Very high — unchanged |
| `useNewOrderAlert.ts` polling | **3 seconds** min | Very high — unchanged |
| `process-notification-queue` invocations | 13+ call sites, fire-and-forget | Each one triggers an edge function that hits DB |
| `useAppLifecycle.ts` → `auto-cancel-orders` | On every app mount | Hits DB immediately on load |
| `useLiveActivityOrchestrator.ts` reconnect | 3s delay, 3 retries | WebSocket reconnect storm |

### Plan (all changes reduce DB pressure)

**1. `src/components/security/ResidentConfirmation.tsx`**
- Change poll interval from 5000ms to 60000ms

**2. `src/hooks/useNewOrderAlert.ts`**
- Change `MIN_POLL_MS` from 3000 to 30000
- Add `isBackendDown()` early return at top of poll function

**3. Create `src/lib/gateNotificationQueue.ts`**
- Single helper that checks `isBackendDown()` before invoking `process-notification-queue`
- If backend is down, silently skip (cron will catch up later)

**4. Replace all 13+ `supabase.functions.invoke('process-notification-queue')` calls** with the gated helper in:
- `src/lib/society-notifications.ts`
- `src/components/chat/OrderChat.tsx`
- `src/components/payment/SellerPaymentConfirmation.tsx`
- `src/components/order/BuyerDeliveryConfirmation.tsx`
- `src/components/payment/UpiDeepLinkCheckout.tsx`
- `src/components/product/ProductEnquirySheet.tsx`
- `src/components/order/OrderCancellation.tsx`
- `src/components/booking/BuyerCancelBooking.tsx`
- `src/components/booking/ServiceBookingFlow.tsx`
- `src/hooks/useOrderDetail.ts` (2 calls)
- `src/hooks/useCartPage.ts` (3 calls)
- `src/components/admin/NotificationDiagnostics.tsx` (keep ungated — admin manual trigger)

**5. `src/hooks/useAppLifecycle.ts`**
- Add `isBackendDown()` guard before `auto-cancel-orders` invocation

**6. `src/hooks/useLiveActivityOrchestrator.ts`**
- Add `isBackendDown()` check in reconnect logic — if true, don't retry

**7. Database trigger migration** (retry when DB recovers)
- Harden `handle_new_user()` with `lock_timeout = 500ms`, `statement_timeout = 2000ms`, exception blocks
- This ensures auth never blocks on profile/role writes again

### Expected outcome
Once these changes deploy, the DB load should drop dramatically. Within 1-5 minutes the connection pool should recover. Then OTP verify and Google sign-in will work because `generateLink` can reach the DB.

### What this does NOT change
- OTP edge function logic (it's correct)
- MSG91 integration (working fine)
- Auth flow structure (working fine)
- The error is purely infrastructure — DB overloaded

