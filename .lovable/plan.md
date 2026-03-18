

## Round 2: Post-Fix Zero-Tolerance System Audit

After thorough re-inspection of all files, here is the verified status of every component and any remaining issues.

---

### Previously Fixed Items — Verified Holding

| Component | Fix | Evidence |
|-----------|-----|----------|
| `quick-reorder` edge function | RPC params use `_` prefix, `_seller_groups` JSON, `approval_status` | L72 selects `approval_status`, L88 filters correctly, L128-137 uses `_buyer_id`, `_seller_groups`, `_payment_method`, `_payment_status` |
| SmartSuggestionBanner toast | Error paths use `toast.info` | L58, L71 |
| SmartSuggestionBanner mutex | Global `isReorderingRef` blocks all concurrent reorders | L16, L22-23, L74-75 |
| Store availability check before reorder | Fetches seller, calls `computeStoreStatus`, blocks if closed | L28-41 |
| `useOrderSuggestions` batch queries | `Promise.all` with `.in('id', ...)` | L49-56 |
| `useOrderDetail` affected rows check | `.select()` after `.update()`, checks `updatedRows.length === 0` | L146-156 |
| `useArrivalDetection` state conversion | Uses `useState<SocietyGeo>` instead of ref, dependency is `society` | L20, L55, L107 |
| `togglePauseShop` mutex | `togglePauseRef` with check at L106, reset in finally | L104-117 |
| Payment session persistence | `sellerUpiId`/`sellerName` stored in session, used as fallback | L27-28, L280-287, L394-396 |
| `useCart` per-product mutex | `addItemLocksRef` Set prevents rapid-tap duplicates | L123, L129-130, L174 |
| Cart optimistic rollback | Both `addItem` and `updateQuantity` restore previous state on error | L166-172, L210-214 |
| Notification dismiss persistence | `markRead.mutate` persists, local `dismissed` handles transient | L22-25 |
| Appointment banner time filter | `timeToMinutes` numeric comparison, filters past bookings | L20-23, L59-63 |
| `ReorderLastOrder` safety | Checks availability, confirms items exist before cart delete | L98-131, L146-147 |
| Sonner toast system | All files use `import { toast } from 'sonner'` |

---

### New Issues Found

#### Issue 1: `HomeNotificationBanner` useEffect Resets Dismissed State Incorrectly

**Severity:** Medium
**Flow:** Buyer — Home Page
**Reproduction:** User dismisses notification. The `useEffect` on L14-17 checks `notification.id !== dismissed`. But `dismissed` is NOT in the dependency array (only `notification?.id` is). When `notification` changes to a new notification, `dismissed` still holds the old ID, so `notification.id !== dismissed` is true and `setDismissed(null)` fires. This is actually **correct** — it clears the dismissed state for a genuinely new notification.

However, there's a subtle issue: if React Query refetches and returns the **same** notification (before `markRead` propagates), `notification?.id` hasn't changed so the effect doesn't re-run. The local `dismissed === notification.id` check at L20 correctly hides it. **This is working correctly. No fix needed.**

#### Issue 2: `quick-reorder` Edge Function — `_seller_groups` Passed as Stringified JSON

**Severity:** Medium
**Flow:** Buyer — Smart Suggestion Reorder
**Reproduction:** L131 passes `_seller_groups: JSON.stringify(sellerGroups)`. The `create_multi_vendor_orders` RPC in `useCartPage.ts` L187 passes `_seller_groups: sellerGroupsPayload` as a raw object (not stringified). If the DB function expects a `jsonb` parameter, Supabase client handles serialization automatically. The edge function double-serializes by calling `JSON.stringify` explicitly. This may cause the RPC to receive a string instead of a JSON object, leading to parsing errors inside the DB function.
**Root Cause:** `supabase/functions/quick-reorder/index.ts` L131 — `JSON.stringify(sellerGroups)` double-serializes the JSON.
**Silent or Visible?** Potentially visible — RPC may fail with a JSON parsing error, caught by L139-144 and returned as 500.
**Real-world Impact:** Smart suggestion reorder may still fail despite parameter name fixes.
**Fix:** Change L131 from `JSON.stringify(sellerGroups)` to just `sellerGroups`. The Supabase client handles JSON serialization automatically.

#### Issue 3: `useCartPage` Coupon State Clears on Every Seller Change — Including Initial Load

**Severity:** Medium
**Flow:** Buyer — Checkout
**Reproduction:** User applies coupon, then navigates away and back. On remount, `currentSellerId` changes from `null` to actual ID. The `useEffect` at L141-147 fires and clears `appliedCoupon` even though it was just set. In practice, coupons aren't persisted across navigations so this is a no-op. But the logic at L143 `if (appliedCoupon && currentSellerId && appliedCoupon.id)` will clear a coupon whenever `currentSellerId` changes — including when user adds a second item from the same seller (which doesn't change `currentSellerId`). **Actually fine for the described flow. No real bug.**

#### Issue 4: `BuyAgainRow` Passes Incomplete Product to `addItem` — Missing `image_urls`

**Severity:** Low
**Flow:** Buyer — Home Page
**Reproduction:** The `addItem` call at L110-125 passes `image_url` (singular) but `Product` type expects `image_urls` (array). The `useCart.addItem` function doesn't use `image_urls` for any logic — it's only used for optimistic UI rendering. The cart query at L82-85 re-fetches full product data anyway. **No functional bug, just type inconsistency.**

---

### Actionable Issue Summary

Only **one genuine issue** remains:

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `quick-reorder` double-serializes `_seller_groups` | Medium | Remove `JSON.stringify()` wrapper at L131 — pass `sellerGroups` directly |

### Implementation Plan

**File:** `supabase/functions/quick-reorder/index.ts`
**Change:** Line 131, change `_seller_groups: JSON.stringify(sellerGroups)` to `_seller_groups: sellerGroups`

This is a one-line fix. After changing, redeploy the edge function.

---

### Top 10 Failures at 10,000 Daily Users

1. **`quick-reorder` double-serialization** — every smart suggestion reorder may fail with JSON parse error in the DB function
2. **Cart stale time (5s)** — brief window where prices shown don't match DB; mitigated by pre-checkout price validation
3. **Geolocation permission prompt never shown on web** — `useArrivalDetection` only watches if permission is already `granted`, never triggers prompt for first-time users
4. **`sessionStorage` payment recovery fails in incognito** — some browsers clear on tab close
5. **Multi-tab cart desync** — no realtime on `cart_items`, so two tabs can show different cart states until `refetchOnWindowFocus` fires
6. **Notification queue edge function invoked on every order action** — could hit rate limits at scale
7. **Live Activity orphans on iOS** — if app is force-killed during delivery, lock screen activity persists
8. **`BuyAgainRow` fallback path latency** — missing inline seller availability forces extra DB query per add
9. **Coupon auto-clear on seller change** — if user adds items from different sellers in sequence, coupon is silently removed
10. **`ReorderLastOrder` always deletes cart** — even when empty, fires unnecessary DELETE query (harmless but wasteful)

