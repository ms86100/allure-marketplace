

## Reality-Check Audit: Findings from Screenshots

Based on thorough code inspection cross-referenced with the user's screenshots, here are the real issues and their root causes.

---

### Issue 1: Live Activity Duplication on Lock Screen

**Severity:** Critical
**Evidence:** Lock screen shows 3x "Ready for Pickup" + 2x "Preparing" cards
**Root Cause:** Two-part failure:

1. **Native iOS plugin never checks for existing activities with the same `entityId`** — `LiveActivityPlugin.swift` L58-67 calls `Activity.request()` unconditionally. If the JS-side dedup is bypassed, iOS creates a new lock-screen card every time.

2. **Hydration reset on app resume creates a race window** — `useLiveActivityOrchestrator` calls `LiveActivityManager.resetHydration()` on every app resume (L197), which sets `hydrationPromise = null`. The 15-second polling fallback (`syncActiveOrders`) runs concurrently. Both paths call `push()`, both await a fresh `hydrate()`, and during the brief window between `starting.add(entityId)` and the native `startLiveActivity` completing, the polling path's `push()` may see `!existing` (hydration hasn't finished mapping), attempt its own start, and the `starting` Set check passes because the first call already cleared it from `finally`.

3. **`cleanupStaleActivities` only runs during hydration** — but if the native plugin already has orphaned activities from a prior session (e.g., app was killed), and hydration's `getActiveActivities` correctly returns them, they get added to the `active` map rather than cleaned up.

**Fix:**
- **Swift side:** Before `Activity.request()`, iterate existing activities and skip if one with the same `entityId` is already active. Return the existing `activity.id` instead.
- **JS side:** Add a debounce/lock around `resetHydration` + `doSync` on app resume to prevent the poll from racing with the resume sync.

---

### Issue 2: Toast Chaos — Three Conflicting Toasts on Order Detail

**Severity:** Critical
**Evidence:** Screenshot shows simultaneously: "Payment submitted! Seller will verify shortly.", "Seller UPI ID is not configured. Please contact the seller.", "Payment was already confirmed! Your order is active."
**Root Cause:** The "Seller UPI ID is not configured" toast does NOT exist in the current codebase — this was from a **previous build** still installed on the device. The current code has replaced that message with "This seller is not accepting UPI payments right now" (L272).

However, the **other two toasts CAN still conflict** in the current code:
- `handleUpiDeepLinkSuccess` fires `toast.success('Payment submitted!...')` (L360)
- When navigating to order detail, `handleUpiDeepLinkFailed` could also fire if the sheet's `onClose` triggers before success completes (L374: checks payment status → already confirmed → fires `toast.success('Payment was already confirmed!...')`)
- The app-resume `visibilitychange` handler in `UpiDeepLinkCheckout` L112-126 can ALSO fire `completeFlow()` which calls `onPaymentConfirmed` → triggers `handleUpiDeepLinkSuccess` AGAIN

**Specific race:** User confirms payment → `handleSubmitConfirmation` calls `completeFlow()` → `onPaymentConfirmed` (= `handleUpiDeepLinkSuccess`) fires the "Payment submitted" toast → navigates to order page. Meanwhile the `visibilitychange` listener fires on tab focus, sees `payment_status === 'buyer_confirmed'`, calls `completeFlow()` again — but `completionTriggeredRef` blocks it. HOWEVER, if the user taps "Confirm Payment" and the app backgrounded/foregrounded during the async RPC, `visibilitychange` fires first, calls `completeFlow()`, then `handleSubmitConfirmation` returns successfully and calls `completeFlow()` again — blocked by ref. So the ref guard works for that case.

The actual remaining conflict: `handleUpiDeepLinkSuccess` fires toast + navigates. Then if `handleUpiDeepLinkFailed` is somehow also triggered (e.g., sheet unmounts → `onClose` → `handleSystemClose` → `onPaymentFailed`), it polls and finds payment is confirmed, fires ANOTHER success toast.

**Fix:**
- Add a `completionHandledRef` in `useCartPage` to prevent both `handleUpiDeepLinkSuccess` AND `handleUpiDeepLinkFailed` from executing if one has already resolved.
- Ensure `handleSystemClose` in `UpiDeepLinkCheckout` does NOT call `onPaymentFailed` when `completionTriggeredRef` is true.

---

### Issue 3: State Inconsistency — Order "Accepted" with Payment "Pending" (COD)

**Severity:** Low (Not actually a bug)
**Evidence:** Screenshot 1 shows order status "Accepted", payment "Pending", payment method "Cash on Delivery"
**Analysis:** This is **correct behavior**. COD orders have `payment_status: 'pending'` until delivery is confirmed and cash is collected. The seller accepts the order (status → accepted) but payment remains pending because cash hasn't been collected yet. This is the expected state machine for COD.

---

### Issue 4: "Seller UPI ID is not configured" Toast

**Severity:** N/A (Ghost from previous build)
**Evidence:** This exact string does not exist in the current codebase.
**Analysis:** The user is running a previous build. Current code shows "This seller is not accepting UPI payments right now" instead. The pre-validation at L269-272 now blocks order creation entirely if UPI ID is missing. **No fix needed in current code.**

---

### Prioritized Fix Plan

**Phase 1 — Critical: Live Activity Deduplication**

| File | Change |
|------|--------|
| `native/ios/LiveActivityPlugin.swift` | In `startLiveActivity`, check if an activity with same `entityId` already exists. If so, update it and return existing `activity.id` instead of creating new one. |
| `src/services/LiveActivityManager.ts` | In `resetHydration()`, don't null the promise if a sync is already in-flight. Add a `syncing` flag to `syncActiveOrders` to prevent concurrent syncs. |
| `src/hooks/useLiveActivityOrchestrator.ts` | Debounce the app-resume sync to avoid racing with the poll timer. Cancel the poll timer during resume sync. |

**Phase 2 — High: Toast Conflict Prevention**

| File | Change |
|------|--------|
| `src/hooks/useCartPage.ts` | Add a `upiCompletionRef` guard so only ONE of `handleUpiDeepLinkSuccess` / `handleUpiDeepLinkFailed` can execute per payment session. |
| `src/components/payment/UpiDeepLinkCheckout.tsx` | In `handleSystemClose`, skip calling `onPaymentFailed` if `completionTriggeredRef.current` is true. |

---

### Answers to Mandatory Questions

**Which fixes are fake?**
None of the code fixes are fake — they are correctly implemented. The "UPI not configured" toast is from a previous build on the device. The toast conflict and Live Activity duplication are real issues that were never flagged in prior audits.

**Which systems are fighting each other?**
1. `visibilitychange` listener vs `handleSubmitConfirmation` completion — both can trigger `completeFlow`
2. App-resume sync vs 15-second poll — both call `syncActiveOrders` → `push()` concurrently after `resetHydration`
3. `handleUpiDeepLinkSuccess` vs `handleUpiDeepLinkFailed` — sheet unmount can trigger failed handler even after success

**What is the single biggest architectural flaw?**
The Live Activity system lacks **native-side deduplication**. The JS layer has guards (`starting` Set, `active` Map), but they can be bypassed by hydration resets. The native `Activity.request()` always creates a new card — it should be the ultimate dedup gate since it's the source of truth for what's on the lock screen.

