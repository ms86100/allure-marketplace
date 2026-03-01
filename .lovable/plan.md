

# Platform Stability & Trust Audit Report

---

## A. Critical Risk Areas

### P0 — Stock Never Restored on Cancellation

**Component**: `decrement_stock_on_order` trigger + order cancellation flow
**What breaks**: Stock is decremented via trigger on `order_items INSERT`. When an order is cancelled (by buyer, seller rejection, auto-cancel timeout, or payment failure), there is **no trigger or function that restores stock**. Over time, products show as unavailable even when they should be in stock.
**Who is impacted**: Seller (lost sales), Buyer (sees "unavailable" for in-stock items)
**Why it matters**: This is a silent revenue leak. Sellers will file support tickets about products mysteriously going out of stock.

**Fix**: Add a trigger on `orders` UPDATE that, when `status` transitions to `cancelled`, increments `stock_quantity` for each `order_item` linked to that order. Guard against double-restore with a check on the old status.

---

### P0 — UPI Payment Failure Leaves Orphaned Orders If Client Crashes

**Component**: `useCartPage.ts` → `handleRazorpayFailed`
**What breaks**: If the buyer's app crashes or loses network after order creation but before the Razorpay modal opens, the orders remain in `placed` + `payment_status=pending` state permanently. The client-side `handleRazorpayFailed` never fires. There is no server-side cleanup for non-urgent UPI orders with `payment_status=pending` that are never paid.
**Who is impacted**: Seller (sees ghost order, tries to fulfill), Buyer (charged stock, no payment)
**Why it matters**: The `auto-cancel-orders` edge function only cancels orders with `auto_cancel_at` set (urgent orders). Non-urgent UPI orders with `pending` payment sit forever.

**Fix**: Extend `auto-cancel-orders` to also cancel orders where `payment_status = 'pending'` AND `payment_method != 'cod'` AND `created_at < now() - interval '15 minutes'`.

---

### P0 — `send-push-notification` Callable Without Auth

**Component**: `supabase/config.toml` → `verify_jwt = false` for `send-push-notification`
**What breaks**: Anyone with the anon key can invoke `send-push-notification` with arbitrary `userId`, `title`, and `body`. An attacker can spam push notifications to any user.
**Who is impacted**: All users
**Why it matters**: Direct abuse vector. Phishing or harassment via push.

**Fix**: Either add `verify_jwt = true` in config.toml (the function is only called from other edge functions using service role), or add explicit service-role-only auth check inside the function. Since it's called from `process-notification-queue` (which uses service key), the safest fix is to validate the Authorization header is the service role key inside the function.

---

### P0 — Test/Seed Edge Functions Exposed in Production

**Component**: `seed-test-data`, `reset-and-seed-scenario`, `seed-integration-test-users`, `save-test-results`
**What breaks**: These functions have `verify_jwt = false` and can wipe/seed data. An attacker with the anon key can invoke them.
**Who is impacted**: All users (data destruction)
**Why it matters**: Complete data wipe possible in production.

**Fix**: Either remove these functions from production deployment, or add an environment guard (`if (Deno.env.get('ENVIRONMENT') !== 'test') return 403`) at the top of each.

---

### P1 — Razorpay Webhook Duplicate Guard Has Gap

**Component**: `razorpay-webhook/index.ts` lines 129-141
**What breaks**: The duplicate check queries `payment_records` for `razorpay_payment_id`, but the `payment_records` row is created during `create_multi_vendor_orders` RPC with `razorpay_payment_id = NULL`. The webhook then does an UPDATE (not INSERT) on `payment_records`. If two webhook deliveries arrive simultaneously before the first UPDATE commits, both pass the duplicate check.
**Who is impacted**: Seller (potential double credit in future settlement logic)
**Why it matters**: Financial integrity issue under concurrent webhook delivery.

**Fix**: Use `UPDATE ... SET razorpay_payment_id = $1 WHERE order_id = $2 AND razorpay_payment_id IS NULL` and check `rowCount > 0` as the atomicity guard instead of a separate SELECT.

---

### P1 — No Offline Guard on Order Placement

**Component**: `useCartPage.ts` → `handlePlaceOrderInner`
**What breaks**: `useNetworkStatus` exists but is not checked before order placement. If a user is offline, the RPC call silently fails, the `catch` shows a generic error, but the user may retry repeatedly (submit guard resets after 1s).
**Who is impacted**: Buyer
**Why it matters**: Frustrating UX; potential duplicate orders if network flickers.

**Fix**: Check `navigator.onLine` before calling `handlePlaceOrderInner`. Show "You're offline" toast and return early.

---

### P1 — `auto-cancel-orders` Has No Invocation Schedule

**Component**: `auto-cancel-orders` edge function
**What breaks**: The function exists but I see no cron trigger configuration. If it's only invoked manually or by an external scheduler that fails, urgent orders with `auto_cancel_at` will never be cancelled server-side. The client-side timer in `UrgentOrderTimer` does a refetch on timeout but does not cancel the order itself.
**Who is impacted**: Seller (stuck orders), Buyer (order hangs)
**Why it matters**: Core urgent-order SLA depends on this running reliably.

**Fix**: Verify cron is configured (e.g., `pg_cron` or external scheduler hitting the endpoint every 30-60 seconds). If not, add it.

---

### P2 — `create-razorpay-order` Has No Auth Validation

**Component**: `create-razorpay-order` edge function, `verify_jwt = false`
**What breaks**: Any caller with the anon key can create Razorpay orders for arbitrary order IDs. While the Razorpay payment won't complete without the buyer paying, it creates noise in the Razorpay dashboard and could be used to probe order IDs.
**Who is impacted**: Platform (financial noise)

**Fix**: Validate that the calling user is the `buyer_id` of the referenced order inside the function.

---

### P2 — Gate Token Signing Secret Derived From Service Role Key

**Component**: `gate-token/index.ts` lines 99-100
**What breaks**: The AES encryption and HMAC signing secrets are substrings of `SUPABASE_SERVICE_ROLE_KEY`. If the service role key is rotated, all previously generated gate tokens become invalid (residents get "Invalid signature" at the gate). Also, using the service role key as cryptographic material is a crypto anti-pattern.
**Who is impacted**: Residents (locked out), Security officers (confused)

**Fix**: Use a dedicated `GATE_TOKEN_SECRET` environment variable. Accept this as a known limitation if rotation is rare.

---

### P2 — Realtime Subscription Filter Bypass

**Component**: `useBuyerOrderAlerts.ts` — subscribes to `orders` UPDATE filtered by `buyer_id=eq.${user.id}`
**What breaks**: Postgres realtime channel filters are client-side hints, not security boundaries. If RLS on the `orders` table is correctly configured (it is — buyers can only SELECT their own orders), this is safe. However, the `orders` table has `REPLICA IDENTITY FULL` enabled, which means the entire row payload (including `buyer.phone`, `buyer.name` via the `buyer` profile) is broadcast. A malicious client subscribing to `orders` without filters could receive all order updates (blocked by RLS on the channel, but worth noting).
**Who is impacted**: Low risk due to RLS, but PII exposure vector if RLS misconfigured.

**Fix**: Document as accepted risk. RLS protects the channel.

---

## B. Trust & UX Failure Scenarios

### B1 — Seller sees product "out of stock" after 10 cancelled orders
A seller with stock tracking enabled gets 10 orders placed and cancelled over a week. Each decrement happens on INSERT, no increment on cancel. Stock shows 0, product auto-marked unavailable. Seller contacts support: "My product disappeared from the marketplace." **Support escalation guaranteed.**

### B2 — Buyer places UPI order, app crashes, order sits forever
Buyer selects UPI, RPC creates order, Razorpay modal never opens due to crash. Order shows in seller dashboard as "Placed" with "Pending" payment. Seller prepares the order. Buyer reopens app, sees order they didn't pay for. **Trust broken for both parties.**

### B3 — Attacker spams push notifications
With the anon key (visible in client bundle), an attacker calls `send-push-notification` with fake userId + phishing title. User receives push saying "Your payment of ₹5000 failed — click here." **Immediate trust destruction.**

### B4 — Seed function invoked in production
Attacker calls `reset-and-seed-scenario` with the public anon key. All production data is wiped. **Catastrophic.**

### B5 — Urgent order never auto-cancelled
If the cron/scheduler for `auto-cancel-orders` stops running, urgent orders sit in "placed" state indefinitely. Seller sees countdown timer but nothing happens after it expires. Buyer is confused. **Both parties escalate.**

---

## C. Small, Safe Improvements

| # | Issue | Fix | Scope |
|---|-------|-----|-------|
| C1 | Stock not restored on cancel | Add DB trigger: on `orders.status` → `cancelled`, increment `products.stock_quantity` for each `order_item` | 1 migration |
| C2 | UPI orphan orders | Extend `auto-cancel-orders` to cancel `payment_status='pending' AND payment_method!='cod' AND age > 15min` | 5 lines in edge function |
| C3 | `send-push-notification` no auth | Add service-role check: `if (req.headers.get('Authorization') !== 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))` return 401 | 3 lines |
| C4 | Test functions exposed | Add `if (!Deno.env.get('ALLOW_TEST_FUNCTIONS')) return 403` to each seed/reset function | 3 lines each |
| C5 | Webhook duplicate race | Change to atomic `UPDATE WHERE razorpay_payment_id IS NULL` + check affected rows | 10 lines |
| C6 | Offline order guard | Add `if (!navigator.onLine)` check in `handlePlaceOrderInner` | 3 lines |
| C7 | `create-razorpay-order` auth | Validate caller is the order's `buyer_id` inside the function | 10 lines |

---

## D. Final Verdict

**⚠️ Conditionally safe — with the following conditions before go-live:**

1. **MUST FIX (P0)**: Stock restoration on cancellation (C1)
2. **MUST FIX (P0)**: UPI orphan order cleanup (C2)
3. **MUST FIX (P0)**: Auth-gate `send-push-notification` (C3)
4. **MUST FIX (P0)**: Disable test/seed functions in production (C4)

**Known Limitations We Accept:**
- Gate token secret derived from service role key (rotation risk is low)
- Delivery fee attribution in multi-vendor orders (documented in orders-payments audit)
- No DB-level validation for `order_items.status` transitions (UI-enforced)
- `auto-cancel-orders` scheduling depends on external cron reliability

**Residual Risk Ownership:**
- Push notification delivery depends on correct FCM token capture (iOS fix deployed, pending TestFlight verification)
- Razorpay webhook idempotency has a narrow race window (P1, not blocking)
- Realtime PII exposure mitigated by RLS but not by channel-level filtering

