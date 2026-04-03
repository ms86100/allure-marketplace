

# Complete Playwright E2E Framework — Final Production-Grade Layers

## What We're Building

A fully working Playwright test framework in `/e2e` with all 6 missing layers added on top of the already-designed architecture: cross-user flows, real push validation, time-based chaos, observability assertions, mobile-first testing, and delivery chaos.

## Files to Create (28 files total)

### Infrastructure (8 files)

| File | Purpose |
|------|---------|
| `e2e/playwright.config.ts` | Config: 3 projects (chromium, mobile-chrome, mobile-safari), 2 retries, HTML report, trace on retry, video, screenshot on failure, network throttling profiles |
| `e2e/.env.example` | Template with SUPABASE_URL, SUPABASE_ANON_KEY, BASE_URL, TEST_PHONE=0123456789, TEST_OTP=1234 |
| `e2e/global-setup.ts` | Warm app, seed test users via edge function (`seed-integration-test-users`), verify bypass phone works |
| `e2e/fixtures/base.fixture.ts` | Extended `test` with `db` fixture (Supabase client using anon key) |
| `e2e/fixtures/user.fixture.ts` | `buyerPage` / `sellerPage` fixtures using Phone+OTP bypass (0123456789/1234), cached to `e2e/.auth/` via `storageState` |
| `e2e/fixtures/db.fixture.ts` | DB query helpers: `getOrder()`, `getNotificationQueue()`, `getPaymentRecord()`, `waitForCondition()` with polling |
| `e2e/README.md` | Full commands: run, debug, smoke, critical, regression, mobile |
| `package.json` | Add `@playwright/test` devDep + scripts: `test:e2e`, `test:e2e:smoke`, `test:e2e:debug` |

### Page Objects (7 files)

| File | Key Methods |
|------|-------------|
| `e2e/pages/auth.page.ts` | `loginWithPhone(phone, otp)` — enters phone, sends OTP, enters code, waits for redirect |
| `e2e/pages/home.page.ts` | `navigateToMarketplace()`, `searchProduct()`, `getFirstProduct()` |
| `e2e/pages/product.page.ts` | `addToCart()`, `getStockCount()`, `waitForLoaded()` |
| `e2e/pages/cart.page.ts` | `goto()`, `getItemCount()`, `proceedToCheckout()`, `getCartTotal()` |
| `e2e/pages/checkout.page.ts` | `selectCOD()`, `selectRazorpay()`, `placeOrder()`, `getOrderId()` |
| `e2e/pages/order.page.ts` | `goto(id)`, `getStatus()`, `waitForStatus()` |
| `e2e/pages/seller.page.ts` | `gotoOrders()`, `findOrder(id)`, `updateStatus(id, status)` |

### Utilities (5 files)

| File | Purpose |
|------|---------|
| `e2e/utils/db-helpers.ts` | Supabase query wrappers with polling: `waitForNotification(orderId, timeout)`, `assertSingleOrder(idempotencyKey)`, `getOrderLogs(orderId)` |
| `e2e/utils/razorpay-mock.ts` | Route interception: `mockSuccess()`, `mockFailure()`, `mockDelayedCallback(delayMs)`, `mockDuplicateWebhook()`, `mockNetworkDrop()` |
| `e2e/utils/notification-helper.ts` | Poll `notification_queue` table, intercept FCM/APNs outbound routes, validate payload structure |
| `e2e/utils/delivery-mock.ts` | `simulateGPSUpdates()`, `simulateOutOfOrder()`, `simulateJump()`, `simulateFreeze()` |
| `e2e/utils/test-data.ts` | `testSlug()`, `seedBuyerAddress()`, `cleanupTestOrders()` |

### Test Suites (8 files)

| File | Tag | What It Tests |
|------|-----|---------------|
| `e2e/tests/buyer/checkout-cod.spec.ts` | @smoke @critical | Phone login → browse → cart → COD → DB order exists → notification in queue |
| `e2e/tests/payments/razorpay-success.spec.ts` | @critical | Mock Razorpay success → single payment record → order status updated |
| `e2e/tests/payments/razorpay-failure.spec.ts` | @regression | Mock failure → order stays pending → retry works |
| `e2e/tests/payments/idempotency.spec.ts` | @critical | Double-click checkout → exactly 1 order in DB, duplicate webhook → exactly 1 payment record |
| `e2e/tests/notifications/order-notification.spec.ts` | @critical | Order placed → notification_queue entry within 5s → payload has correct order_id, seller_id, type |
| `e2e/tests/edge-cases/rls-validation.spec.ts` | @critical | Buyer queries seller orders via Supabase client → empty result, seller queries other seller's products → blocked |
| **NEW** `e2e/tests/cross-user/buyer-seller-flow.spec.ts` | @critical | Buyer places order → Seller sees same order_id → Seller updates status → Buyer sees update → Notification triggered for each transition |
| **NEW** `e2e/tests/edge-cases/time-chaos.spec.ts` | @regression | Intercept routes to add 10s delays → UI shows processing state → no duplicate retries → system recovers |

## The 6 Missing Layers — How Each Is Implemented

### 1. Cross-User E2E Flow (`buyer-seller-flow.spec.ts`)

Uses both `buyerPage` and `sellerPage` fixtures in a single test. Buyer places COD order, extracts `order_id`. Seller navigates to orders page (defaulting to "selling" tab per existing behavior), finds same `order_id`, updates status. DB assertion confirms status change. Buyer page refreshes and sees updated status. Notification queue is checked for each transition event. This validates the complete real-world chain with DB consistency across roles.

### 2. Push Notification Validation (Enhanced `notification-helper.ts`)

Three validation layers:
- **DB**: Poll `notification_queue` for entry with matching `order_id`, assert `status`, `payload` structure, `created_at` within 5s
- **API Interception**: Use `page.route()` to intercept outbound calls to `fcm.googleapis.com/v1/` and `api.push.apple.com/3/device/`, capture request body, assert payload contains correct `title`, `body`, `data.order_id`, and `sound: "gate_bell.mp3"` for iOS
- **Processing**: Query `notification_queue` again after edge function runs, assert `status = 'sent'` and `attempts > 0`

We cannot test actual device rendering in Playwright (that requires Appium/XCUITest), but we validate the full pipeline up to the push provider API call.

### 3. Time-Based Chaos (`time-chaos.spec.ts`)

Uses `page.route()` to add artificial delays:
- Delay `process-notification-queue` responses by 30s → assert UI doesn't show stale data
- Delay `confirm-razorpay-payment` by 10s → assert "processing" UI state remains, no duplicate confirmation attempts
- Delay Supabase REST API responses by 5s → assert loading states render, no crashes

Each scenario asserts: no duplicate DB entries, UI shows appropriate loading/processing state, system recovers after delay ends.

### 4. Observability Validation (in `db-helpers.ts`)

Query `push_logs` table to assert log entries exist for:
- Order creation events
- Notification processing (with duration metrics)
- Payment confirmation

Assert `request_id` correlation: same notification `id` appears in `notification_queue.id` and `push_logs.metadata->>'notification_id'`. Fail test if critical steps have zero log entries (silent failures).

### 5. Mobile-First Testing (Playwright config)

Three test projects:
- `chromium` — desktop baseline
- `mobile-chrome` — Pixel 5 viewport (393x851), touch enabled
- `mobile-safari` — iPhone 13 viewport (390x844), touch enabled

Network throttling via `page.route('**/*', route => setTimeout(() => route.continue(), 2000))` for 3G simulation on specific test files tagged `@mobile`.

App resume simulation: `page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))` after navigation to test foreground/background transitions.

### 6. Delivery Chaos (Enhanced `delivery-mock.ts`)

Utilities that insert rows directly into `delivery_tracking` via Supabase client:
- **Out-of-order**: Insert location update with `timestamp` older than last entry
- **Duplicate**: Insert same lat/lng/timestamp twice
- **GPS jump**: Insert location 50km away from previous point
- **Freeze**: Insert same location 10 times with incrementing timestamps

Tests assert: no UI crashes, DB accepts/rejects appropriately, route display doesn't glitch (checked via absence of error toasts).

## Auth Flow Detail

```text
1. page.goto('/#/auth')
2. Fill phone input with "0123456789"
3. Check age confirmation checkbox
4. Click "Send OTP" button
5. Wait for OTP input screen (4-digit fields)
6. Enter "1234" across OTP fields
7. Click "Verify"
8. Wait for redirect to marketplace/society
9. Save storageState to e2e/.auth/buyer.json
```

Seller auth uses the same bypass phone — the existing `seed-integration-test-users` edge function assigns seller role. If a second user is needed, we create one via the admin API in `global-setup.ts`.

## CI/CD (`.github/workflows/e2e.yml`)

- **On PR**: Run `@smoke` tests only (chromium), ~2 min
- **Nightly**: Full suite all 3 projects, ~15 min
- **Artifacts**: HTML report + traces + videos uploaded on failure
- **Secrets**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` from GitHub repository secrets

## Risk & Limitations

| Area | Limitation | Mitigation |
|------|-----------|------------|
| Real push delivery to device | Cannot test in Playwright | Validate up to FCM/APNs API call via interception |
| Actual Razorpay SDK | Cannot load real SDK in test | Route interception simulates all scenarios |
| GPS/map rendering | Playwright can't verify map tiles | Assert DB state + absence of error toasts |
| Background/foreground | `visibilitychange` is approximation | Full native testing requires Appium separately |

