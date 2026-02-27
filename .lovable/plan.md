

## PRE-PRODUCTION DEFECT AUDIT

---

### P0 — GO-LIVE BLOCKERS

---

#### DEFECT 1: `delivery_handled_by` is NEVER set on orders

**Who:** Seller, Rider, Admin
**Scenario:** Buyer places order → `create_multi_vendor_orders` RPC creates the order → `delivery_handled_by` column on the order is always NULL
**Observed:** Every order in production has `delivery_handled_by = NULL` (verified via live DB query — all 10 recent orders show `<nil>`)
**Expected:** Orders should have `delivery_handled_by = 'seller'` or `'platform'` based on the seller's `fulfillment_mode`
**Root cause:** The `create_multi_vendor_orders` function does NOT set `delivery_handled_by` on the `orders` INSERT. The column was added to the `orders` table (migration `20260227083004`) but the RPC was never updated to populate it. The trigger on `seller_profiles` auto-derives it, but there is NO equivalent trigger on `orders`.
**Impact:** The entire fulfillment redesign is broken — downstream code that checks `delivery_handled_by` on orders will always see NULL.
**Severity:** P0

**Fix:**
- Update `create_multi_vendor_orders` RPC to look up `delivery_handled_by` from `seller_profiles` for each `_seller_id` and set it on the order INSERT
- Files: New migration to `CREATE OR REPLACE FUNCTION public.create_multi_vendor_orders`
- Do NOT touch: existing order statuses, notification triggers, cart logic

---

#### DEFECT 2: Delivery partner auto-assigned for seller-delivers orders

**Who:** Seller, Rider
**Scenario:** Seller sets fulfillment to "I Deliver" → buyer places order with delivery → order reaches `ready` → `trg_auto_assign_delivery` fires → a `delivery_assignments` row is created → a rider is notified
**Observed:** The trigger checks `NEW.fulfillment_type != 'delivery'` — it does NOT check `delivery_handled_by`. So ALL delivery orders (seller-delivers AND platform-delivers) create delivery assignments.
**Expected:** Only `delivery_handled_by = 'platform'` orders should auto-create delivery assignments
**Root cause:** `trg_auto_assign_delivery` was written before the fulfillment redesign and was never updated to check `delivery_handled_by`
**Impact:** Riders get spuriously assigned to orders the seller intended to deliver themselves. Sellers see confusing delivery partner notifications.
**Severity:** P0

**Fix:**
- Update `trg_auto_assign_delivery` to add: `IF NEW.delivery_handled_by != 'platform' THEN RETURN NEW; END IF;`
- Files: New migration with `CREATE OR REPLACE FUNCTION`
- Do NOT touch: delivery status flow, OTP logic, manage-delivery edge function

---

#### DEFECT 3: Zero device tokens — push notifications cannot be delivered

**Who:** Seller (primarily), all users
**Scenario:** Seller has the app installed with notifications enabled → buyer places order → `process-notification-queue` fires → `send-push-notification` is invoked → queries `device_tokens` table → finds 0 rows → returns "No device tokens found" → notification is NOT delivered
**Observed:** `device_tokens` table has 0 rows (verified via live DB)
**Expected:** Sellers and buyers should have their FCM tokens registered
**Root cause:** The `usePushNotifications` hook code is correct, but the native app build likely hasn't been rebuilt with this code. The UPSERT uses `onConflict: 'user_id,token'` which requires a unique constraint — this exists in the migration. The RLS policies are correct (INSERT WITH CHECK auth.uid() = user_id). The most likely cause is the native binary has not been rebuilt (`npx cap sync` + `npx cap run ios`).
**Impact:** ALL push notifications fail silently. Sellers never receive background/closed-app alerts for new orders.
**Severity:** P0 (requires user action: rebuild native app)

**Fix (code side):** No code fix needed — RLS and hooks are correct. The user must rebuild the native app.
**Verification:** After rebuilding, check Xcode console for `[Push] Token saved successfully`. Then verify `SELECT COUNT(*) FROM device_tokens` returns > 0.

---

### P1 — MUST-FIX BEFORE SCALE

---

#### DEFECT 4: `process-notification-queue` not triggered for new orders from DB triggers

**Who:** Seller
**Scenario:** Order is placed → `enqueue_order_placed_notification` trigger inserts into `notification_queue` → but nobody invokes `process-notification-queue` edge function → notification sits in queue until the 60-second pg_cron job runs
**Observed:** Cart page does fire `process-notification-queue` after order creation (line 222 of useCartPage.ts), but if the RPC itself triggers additional notifications (e.g., status changes during the transaction), those wait for cron.
**Expected:** Near-instant notification delivery for new orders
**Root cause:** The cron job runs every 60 seconds. The manual invocation in `useCartPage.ts` only covers the initial order placement, not subsequent status changes triggered by sellers (accept, ready, etc.)
**Impact:** Sellers accepting orders, marking ready, etc. — buyers receive notifications with up to 60s delay
**Severity:** P1

**Fix:**
- In seller-facing order action handlers (wherever `supabase.from('orders').update({ status: ... })` is called), add a fire-and-forget call to `supabase.functions.invoke('process-notification-queue')`
- Files: `src/pages/OrderDetailPage.tsx` or equivalent seller order action components
- Do NOT touch: DB triggers, cron configuration

---

#### DEFECT 5: Settlement process requires delivery confirmation but self-pickup orders never get delivery_assignments

**Who:** Seller, Admin
**Scenario:** Buyer places a self-pickup order → seller marks it as completed → `process-settlements` tries to settle → checks `delivery_assignments` for status `delivered` → no assignment exists → settlement is skipped with error "Delivery not confirmed"
**Observed:** `process-settlements` (line 66-75) always checks `delivery_assignments.status = 'delivered'` regardless of fulfillment type
**Expected:** Self-pickup and seller-delivers orders should be eligible for settlement without a delivery assignment
**Root cause:** Settlement logic was written assuming all orders have delivery assignments
**Impact:** Sellers with self-pickup or I-deliver orders will NEVER receive settlements
**Severity:** P1

**Fix:**
- In `process-settlements/index.ts`, check the order's `fulfillment_type`. If `self_pickup` or `delivery_handled_by = 'seller'`, skip the delivery assignment check and use order status `completed`/`delivered` as the settlement gate instead.
- Files: `supabase/functions/process-settlements/index.ts`
- Do NOT touch: payment verification logic, settlement status transitions

---

#### DEFECT 6: `useNewOrderAlert` LOOKBACK_MS causes stale alerts on cold start

**Who:** Seller
**Scenario:** Seller opens app after being closed for 2 hours → `lastSeenAtRef` is set to `now() - 5 minutes` → polling query only fetches orders from last 5 minutes → orders placed 6+ minutes ago are missed
**Observed:** `LOOKBACK_MS = 5 * 60 * 1000` (line 36 of useNewOrderAlert.ts)
**Expected:** On app open, ALL actionable orders (placed/enquired/quoted) should be shown, regardless of when they were created
**Root cause:** The lookback window is hardcoded to 5 minutes. Orders older than 5 minutes with actionable status are invisible.
**Impact:** Seller misses orders placed while the app was closed for more than 5 minutes
**Severity:** P1

**Fix:**
- On initial poll (first poll after mount), query ALL orders with actionable statuses regardless of `created_at` cutoff. Only use `lastSeenAtRef` for subsequent polls.
- Files: `src/hooks/useNewOrderAlert.ts`
- Do NOT touch: realtime subscription, buzzing logic

---

#### DEFECT 7: Razorpay webhook processes only first order in multi-vendor cart

**Who:** Buyer, Seller
**Scenario:** Buyer places order with items from 2 sellers → 2 orders are created → Razorpay order is created for first order only → webhook `payment.captured` fires → updates only `orderId` from `paymentEntity.notes.order_id` (singular) → second order stays `payment_status: pending` forever
**Observed:** The `create-razorpay-order` function stores only one `order_id` in Razorpay notes. The webhook handler (line 101) reads only `paymentEntity.notes?.order_id`.
**Expected:** All orders in the cart should be marked as paid when payment succeeds
**Root cause:** Razorpay notes only hold one `order_id`. Multi-vendor UPI orders are partially implemented — `useCartPage.ts` already disables UPI for multi-seller carts (line 52), so this is mitigated for now.
**Impact:** Currently mitigated because UPI is disabled for multi-seller carts. But if that guard is ever removed, second seller's order will never be marked paid.
**Severity:** P1 (mitigated but fragile)

**Fix:**
- Label this as "Present but fragile" — add a code comment documenting that UPI multi-vendor is not supported
- If multi-vendor UPI is ever needed, pass all order_ids in notes or use a junction approach
- Do NOT touch: existing webhook handler logic for single orders

---

### P2 — FIX BEFORE SCALE

---

#### DEFECT 8: `startBuzzing` called every time `pendingAlerts.length` changes

**Who:** Seller
**Scenario:** 3 new orders arrive in quick succession → `pendingAlerts` goes from 0→1→2→3 → the buzzing effect in `useNewOrderAlert.ts` fires `startBuzzing()` 3 times → 3 overlapping `setInterval` timers are created (line 92), each buzzing every 3s
**Observed:** `startBuzzing` creates a new `setInterval` without clearing the previous one (line 92). The guard `if (pendingAlerts.length > 0) { startBuzzing() }` runs on every length change.
**Expected:** Only one buzzing interval should be active at a time
**Root cause:** The effect at line 193-200 calls `startBuzzing()` whenever `pendingAlerts.length` changes and is > 0, but `startBuzzing` doesn't check if an interval is already running before creating a new one.
**Impact:** Multiple overlapping alarm sounds, excessive haptic vibrations, battery drain
**Severity:** P2

**Fix:**
- Add a guard at the top of `startBuzzing`: `if (intervalRef.current) return;`
- Files: `src/hooks/useNewOrderAlert.ts`
- Do NOT touch: dismiss/snooze logic

---

#### DEFECT 9: Cart clears server-side in RPC but client also calls `clearCart()`

**Who:** Buyer
**Scenario:** Buyer places COD order → `create_multi_vendor_orders` RPC runs `DELETE FROM cart_items WHERE user_id = _buyer_id` (line 153) → control returns to `useCartPage.ts` → line 218 calls `await clearCart()` which does another `DELETE FROM cart_items WHERE user_id = user.id`
**Observed:** Double cart clear — the second one is a no-op but adds an unnecessary network round-trip
**Expected:** Cart should be cleared once
**Root cause:** The RPC already clears the cart atomically. The client-side `clearCart()` is redundant.
**Impact:** Minor — extra network call, slightly slower UX. Not a data bug.
**Severity:** P2

**Fix:**
- Remove the `await clearCart()` call in `useCartPage.ts` after COD order creation. Keep the `await refresh()` to update the UI.
- Files: `src/hooks/useCartPage.ts`
- Do NOT touch: UPI flow (needs different handling)

---

#### DEFECT 10: `PushNotificationProvider` calls `removeTokenFromDatabase` on initial render when user is null

**Who:** All users
**Scenario:** App loads → `PushNotificationProvider` mounts → `user` is null (auth still loading) → `useEffect` fires → `removeTokenFromDatabase` is called → but `token` is also null → function exits early (line 57 of usePushNotifications.ts: `if (!user || !token) return`)
**Observed:** The effect runs on every render where `user` is null, including initial load
**Expected:** Token removal should only happen on explicit logout, not on initial null state
**Root cause:** The effect in `PushNotificationProvider` (line 18-20) doesn't distinguish between "user not yet loaded" and "user logged out"
**Impact:** Currently harmless because of the guard, but semantically incorrect and could cause issues if the guard is ever relaxed
**Severity:** P2

**Fix:**
- Track previous user state with a ref. Only call `removeTokenFromDatabase` when user transitions from non-null to null.
- Files: `src/components/notifications/PushNotificationProvider.tsx`

---

### RISK AREAS

| Area | Status | Risk |
|---|---|---|
| `delivery_handled_by` on orders | **Present but never populated** | All fulfillment routing decisions based on this field will fail |
| Auto-assign delivery trigger | **Present but incorrectly scoped** | Riders assigned to orders sellers intended to deliver |
| Push notification delivery | **Present but inactive** (0 device tokens) | Requires native app rebuild by user |
| Settlement for non-delivery orders | **Present but missing last-mile wiring** | Self-pickup sellers never get paid |
| Multi-vendor UPI payments | **Present but intentionally disabled** | Guard exists at line 52 of useCartPage.ts; fragile if removed |
| Notification delivery latency | **Present but delayed** | Status change notifications rely on 60s cron, no immediate invocation |

---

### GO-LIVE RISK SUMMARY

**P0 Blockers (3):**
1. `delivery_handled_by` never set on orders — fulfillment redesign is broken
2. Delivery partner auto-assigned for seller-delivers orders — wrong rider assignments
3. Zero device tokens — push notifications completely non-functional (requires native rebuild)

**P1 Must-Fix Before Scale (4):**
4. Notification delivery delay for status changes (up to 60s)
5. Settlements blocked for self-pickup/seller-delivers orders
6. 5-minute lookback misses older actionable orders on cold start
7. Multi-vendor UPI fragility (mitigated but undocumented)

**P2 Quality Issues (3):**
8. Overlapping buzzing intervals
9. Redundant cart clear
10. Token removal on initial null state

---

### VERDICT

**⚠️ Safe only with restrictions:**

The system can go live for **limited testing with COD-only, self-pickup sellers** provided:
- Defects 1 and 2 are fixed (DB migration only, no frontend changes needed)
- The user rebuilds the native app to register device tokens (Defect 3)
- Sellers are informed that settlements for non-delivery orders are not yet automated (Defect 5)
- UPI payments are restricted to single-seller carts (already enforced)

**NOT safe for go-live** if any seller uses "I Deliver" or "Delivery Partner" fulfillment modes — the delivery assignment trigger will malfunction.

