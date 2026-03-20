

## Round 2: 20 Production Bugs & Hidden Issues

### Bug 1: `auto-cancel-orders` cancels without status guard on the cancel UPDATE
**What**: Line 119-126 — the cancel `UPDATE` uses `.eq("id", order.id)` but does NOT include `.eq("status", ...)` guard. If a seller accepts the order between the SELECT and UPDATE, the accepted order gets cancelled.
**Why**: Race condition between seller acceptance and cron — customer loses a valid order.
**Where**: `supabase/functions/auto-cancel-orders/index.ts` line 119
**Fix**: Add `.in("status", cancellableStatuses)` to the cancel UPDATE, matching the same guard used for auto-complete (line 104).

### Bug 2: `delete-user-account` doesn't clean `orders`, `order_items`, or `chat_messages`
**What**: The cleanup table list (lines 32-53) misses `orders`, `order_items`, `chat_messages`, `service_bookings`, `delivery_assignments`, `delivery_locations`, `payment_records`, `seller_settlements`. After auth user deletion, these become orphaned rows with dangling `buyer_id` references.
**Why**: Foreign key violations on joins, orphaned financial data, and potential GDPR non-compliance.
**Where**: `supabase/functions/delete-user-account/index.ts` lines 32-53
**Fix**: Add anonymization for orders (set `buyer_id` fields to null or a sentinel) and delete chat messages, bookings, and other personal data before auth deletion.

### Bug 3: `replaceCart` deletes then inserts without a transaction — partial failure leaves empty cart
**What**: In `useCart.tsx` line 309, `replaceCart` first DELETEs all cart items, then INSERTs new ones. If the INSERT fails (network error, RLS), the user's cart is wiped with no rollback.
**Why**: User loses their entire cart on a transient network blip during reorder.
**Where**: `src/hooks/useCart.tsx` lines 308-318
**Fix**: Wrap in an RPC or use upsert pattern. Short-term: snapshot the old cart and restore on INSERT failure.

### Bug 4: `quick-reorder` idempotency key uses `Date.now()` — never deduplicates
**What**: Line 146: `_idempotency_key: \`reorder_${order_id}_${Date.now()}\``. Since `Date.now()` changes every millisecond, every retry generates a unique key, defeating the idempotency mechanism entirely.
**Why**: Double-tap or network retry creates duplicate orders.
**Where**: `supabase/functions/quick-reorder/index.ts` line 146
**Fix**: Use a stable key like `reorder_${order_id}_${user.id}` or hash the items payload. Reset only after confirmed success.

### Bug 5: `archive-old-data` deletes orders without checking active payment records or settlements
**What**: Lines 62-70 — orders in "completed" status older than 90 days are archived and deleted. But `payment_records` and `seller_settlements` reference `order_id`. If settlements are still "pending" or "processing", the FK reference breaks.
**Why**: Financial records become orphaned; settlement processing fails silently.
**Where**: `supabase/functions/archive-old-data/index.ts` lines 46-75
**Fix**: Before archiving, verify no pending/processing settlements exist for those orders. Also archive `payment_records` alongside orders.

### Bug 6: `process-settlements` queries ALL terminal success statuses across ALL workflow types
**What**: Lines 77-85 — the settlement function fetches `category_status_flows` where `is_terminal=true AND is_success=true` globally. This returns statuses from different workflow types (e.g., `quoted_accepted` from enquiry flows). An order could match a terminal status from a different workflow and settle prematurely.
**Why**: Premature or incorrect settlement for orders whose workflow wasn't actually completed.
**Where**: `supabase/functions/process-settlements/index.ts` lines 77-85
**Fix**: Filter by the order's actual workflow key (join through `listing_type_workflow_map` or use the order's `order_type`/`fulfillment_type`).

### Bug 7: `razorpay-webhook` returns 400 for missing `order_id` in notes — Razorpay retries indefinitely
**What**: Lines 120-126 — if `paymentEntity.notes?.order_id` is undefined, the function returns 400. Razorpay treats 4xx as retryable, so it will keep sending this webhook forever.
**Why**: Webhook retry storm filling logs and burning edge function quota.
**Where**: `supabase/functions/razorpay-webhook/index.ts` lines 120-126
**Fix**: Return 200 with `{ acknowledged: true, skipped: 'no_order_id' }` — Razorpay stops retrying on 2xx.

### Bug 8: `create-razorpay-order` doesn't verify order status before creating payment
**What**: Lines 78-91 — the function checks if the order exists and belongs to the buyer, but doesn't check if the order is still in a valid status (e.g., not already cancelled or paid). A buyer could create a Razorpay payment for a cancelled order.
**Why**: Buyer pays for a cancelled order; refund required, money locked.
**Where**: `supabase/functions/create-razorpay-order/index.ts` lines 78-91
**Fix**: Add `.neq('status', 'cancelled').eq('payment_status', 'pending')` to the order query.

### Bug 9: `useLoginThrottle` uses `localStorage` — trivially bypassed
**What**: The entire login throttling mechanism (lines 12-25) stores attempt counts in `localStorage`. An attacker can simply clear storage or use incognito mode to bypass the lockout.
**Why**: Brute-force protection is effectively non-existent; false sense of security.
**Where**: `src/hooks/useLoginThrottle.ts`
**Fix**: Move rate limiting to the server side (edge function or RPC) keyed by IP + phone/email. Keep client-side as UX-only feedback.

### Bug 10: `manage-delivery` `handleAssign` has no authorization check — any authenticated user can assign riders
**What**: Lines 139-174 — `handleAssign` only checks that the assignment exists and is in 'pending' status. It doesn't verify the caller is the seller, an admin, or has any role related to the order.
**Why**: Any authenticated user with a valid `assignment_id` can assign themselves as a rider, hijacking deliveries.
**Where**: `supabase/functions/manage-delivery/index.ts` lines 139-174
**Fix**: Verify `userId` is the order's seller (`user_id`), a society admin, or has delivery management permissions.

### Bug 11: `manage-delivery` `handleComplete` has no authorization — any user can verify OTP and complete delivery
**What**: Lines 307-364 — `handleComplete` only requires a valid `assignment_id` and OTP. No check that the caller is the delivery partner, seller, or buyer.
**Why**: If OTP leaks (screenshot, accidental share), anyone can mark the delivery as complete.
**Where**: `supabase/functions/manage-delivery/index.ts` lines 307-364
**Fix**: Verify caller is the assigned `partner_id` or the seller's `user_id`.

### Bug 12: `manage-delivery` webhook allows `delivered` status without OTP verification
**What**: Lines 454-469 — the 3PL webhook handler maps `status: 'delivered'` directly to `delivered` status on `delivery_assignments` and updates the order, completely bypassing OTP verification.
**Why**: A compromised 3PL webhook (or misconfigured integration) can mark orders as delivered without buyer confirmation, enabling fraud.
**Where**: `supabase/functions/manage-delivery/index.ts` lines 454-472
**Fix**: Map 3PL `delivered` to `at_gate` instead, requiring OTP completion for the final step. Or add a `delivery_confirmed_via` field to distinguish OTP vs webhook completions.

### Bug 13: `ServiceBookingFlow` deletes orders directly from client on rollback — bypasses RLS
**What**: Lines 205, 228-229 — on booking failure, the frontend tries `supabase.from('orders').delete().eq('id', order.id)`. The RLS policy likely blocks buyer DELETE on orders, so this silently fails, leaving orphaned orders.
**Why**: Orphaned `placed`/`requested` orders accumulate in the system with no cleanup path.
**Where**: `src/components/booking/ServiceBookingFlow.tsx` lines 205, 228-229
**Fix**: Use an RPC (`cancel_failed_booking`) that runs with SECURITY DEFINER and properly cleans up the order + items + booking atomically.

### Bug 14: `useSellerChat` has TOCTOU race on conversation creation
**What**: Lines 23-47 — `getOrCreate` first SELECTs to check if conversation exists, then INSERTs if not. Two concurrent messages can both see "no conversation" and both try to INSERT, causing a unique constraint violation.
**Why**: First message from buyer fails with a DB error; user sees "Could not create conversation."
**Where**: `src/hooks/useSellerChat.ts` lines 23-47
**Fix**: Use upsert with `onConflict` on `(buyer_id, seller_id, product_id)` or wrap in a DB function with conflict handling.

### Bug 15: `rate-limiter` retry path doesn't increment — allows burst bypass
**What**: Lines 92-111 — `checkRateLimitRetry` only reads the current count and checks if it's over limit. It does NOT increment. So if two concurrent requests race, both hit the optimistic lock failure, both call retry, and both get `allowed: true` without incrementing.
**Why**: Under concurrent load, the rate limiter can be bypassed, allowing 2x the intended limit.
**Where**: `supabase/functions/_shared/rate-limiter.ts` lines 92-111
**Fix**: The retry path should also attempt an atomic increment, not just read.

### Bug 16: `useBuyerOrderAlerts` caches `displayLabelCache` in module scope — stale across sessions
**What**: Line 30 — `displayLabelCache` is a module-level variable, not a React state or ref. Once populated, it never refreshes, even if the user logs out and back in, or if admin updates flow labels.
**Why**: Buyer sees stale/wrong status labels until they do a hard refresh.
**Where**: `src/hooks/useBuyerOrderAlerts.ts` line 30
**Fix**: Add a TTL (e.g., 5 minutes) or invalidate on auth change.

### Bug 17: `send-booking-reminders` compares time strings across timezone boundaries
**What**: Lines 45-46 — `fromTime.toTimeString().slice(0, 8)` uses the server's local timezone to generate time strings, but `start_time` in the DB is stored in the seller's configured timezone (or UTC). If the edge function runtime is in a different timezone, the comparison is wrong.
**Why**: Reminders fire at wrong times — either too early (annoying) or too late (useless).
**Where**: `supabase/functions/send-booking-reminders/index.ts` lines 37-46
**Fix**: Use UTC consistently: `new Date().toISOString().slice(11, 19)` for time extraction, or store and compare as UTC timestamps.

### Bug 18: `manage-delivery` `handleUpdateStatus` sets order to `returned` on delivery failure without checking current order status
**What**: Line 261 — when delivery status is `failed`, the code blindly sets `orders.status = 'returned'` without checking what the current order status is. If the order was already cancelled or refunded, this resurrects it.
**Why**: Cancelled/refunded orders get status overwritten to `returned`, confusing buyers and breaking financial reconciliation.
**Where**: `supabase/functions/manage-delivery/index.ts` line 261
**Fix**: Add `.neq('status', 'cancelled').neq('status', 'completed')` guard to the order UPDATE.

### Bug 19: `useNewOrderAlert` `seenIdsRef` grows unboundedly
**What**: Line 47 — `seenIdsRef` is a `Set` that accumulates order IDs forever during the session. For a busy seller receiving hundreds of orders per day, this set grows without bound, consuming memory.
**Why**: Memory leak that degrades performance over long seller sessions.
**Where**: `src/hooks/useNewOrderAlert.ts` line 47
**Fix**: Cap the set size (e.g., 500 entries) or use an LRU structure. Prune oldest entries when size exceeds threshold.

### Bug 20: `handleCalculateFee` doesn't authenticate delivery fee calculation — info leak + manipulation
**What**: Lines 487-514 — `handleCalculateFee` is behind auth, but any authenticated user can query any `order_value` and learn the exact fee structure, thresholds, and margins (partner payout split, platform margin). This info should be seller/admin-only.
**Why**: Competitive intelligence leak; malicious users can game the free delivery threshold.
**Where**: `supabase/functions/manage-delivery/index.ts` lines 487-514
**Fix**: Only return `delivery_fee` and `free_delivery` to buyers. Hide `partner_payout` and `platform_margin` unless the caller is an admin or seller.

---

## Implementation Plan

| Priority | Bugs | Action |
|----------|------|--------|
| **P0 — Security** | 10, 11, 12 | Add authorization checks to `handleAssign`, `handleComplete`, and guard webhook `delivered` status |
| **P0 — Data integrity** | 1, 8 | Add status guards to auto-cancel UPDATE and Razorpay order creation |
| **P0 — Financial** | 5, 6, 7 | Fix archive FK, settlement workflow filter, webhook 200 response |
| **P1 — Idempotency** | 4, 3 | Fix reorder idempotency key, add rollback to `replaceCart` |
| **P1 — Auth/Security** | 9, 15, 20 | Server-side login throttle, fix rate limiter retry, hide fee margins |
| **P1 — Data cleanup** | 2, 13 | Expand delete-user cleanup, replace client-side order DELETE with RPC |
| **P2 — Robustness** | 14, 16, 17, 18, 19 | Chat upsert, cache TTL, timezone fix, status guard on `returned`, bounded Set |

### Implementation order:
1. **manage-delivery authorization** (Bugs 10, 11, 12) — single file edit, highest severity
2. **auto-cancel status guard** (Bug 1) — one-line fix
3. **Razorpay order status check** (Bug 8) — one-line fix
4. **Razorpay webhook 200 response** (Bug 7) — one-line fix
5. **reorder idempotency** (Bug 4) — one-line fix
6. **archive FK safety** (Bug 5) — add settlement check before delete
7. **settlement workflow filter** (Bug 6) — join order type into query
8. **replaceCart rollback** (Bug 3) — add try/catch with restore
9. **delete-user expansion** (Bug 2) — add missing tables
10. **Remaining P1/P2 fixes** (Bugs 9, 13-20) — individual targeted edits

