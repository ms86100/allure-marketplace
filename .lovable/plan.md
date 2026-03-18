

## Round 1: Post-Fix Zero-Tolerance System Audit

After thorough code inspection, here are the **new and remaining issues** found. Previously fixed items (Round 2) are confirmed as holding.

---

### Issue 1: `quick-reorder` Edge Function RPC Parameter Mismatch — Orders Will Fail

**Severity:** Critical  
**Flow:** Buyer — Home Page (SmartSuggestionBanner Reorder)  
**Reproduction:** Tap "Reorder" on a smart suggestion. The edge function calls `create_multi_vendor_orders` with parameters `p_buyer_id`, `p_society_id`, `p_items`, `p_fulfillment_type`, `p_delivery_fee`, `p_discount_amount` (L112-124 of edge function). The actual RPC signature expects `_buyer_id`, `_seller_groups`, `_payment_method`, `_payment_status`, etc. The parameter names don't match (`p_` vs `_` prefix, `p_items` vs `_seller_groups`).  
**Root Cause:** `supabase/functions/quick-reorder/index.ts` L112-124 uses `p_` prefixed params and a flat `p_items` array, while the DB function expects `_` prefixed params with `_seller_groups` JSON containing seller-grouped items. This RPC call will always fail with a parameter mismatch error.  
**Silent or Visible?** Partially visible — the catch on L53 of `SmartSuggestionBanner` navigates to product page with a misleading "Added to cart" toast, masking the real failure.  
**Real-world Impact:** Every "Reorder" tap from SmartSuggestionBanner silently fails. User sees "Added to cart" but nothing was added.  
**Fix:** Rewrite the edge function to use correct `_` prefixed parameter names, and restructure items into the `_seller_groups` JSON format the RPC expects. Must also include required params `_payment_method` and `_payment_status`.

---

### Issue 2: SmartSuggestionBanner Shows Misleading Toast on Reorder Failure

**Severity:** High  
**Flow:** Buyer — Home Page  
**Reproduction:** When `quick-reorder` fails (which it always does per Issue 1), L53-55 catches the error and shows `toast.success('Added to cart. Review your cart to complete the order.')` — a **success** toast for a **failure** state. Then navigates to product page.  
**Root Cause:** `SmartSuggestionBanner.tsx` L53-55 — error path uses `toast.success` instead of `toast.error` or `toast.info`.  
**Silent or Visible?** Visible — user sees green success toast but nothing happened.  
**Fix:** Change to `toast.info('Could not reorder automatically. Showing product details.')` or similar.

---

### Issue 3: `HomeNotificationBanner` Dismiss Resets on New Notification Arriving

**Severity:** Medium  
**Flow:** Buyer — Home Page  
**Reproduction:** User dismisses notification A. `markRead.mutate` fires. But the `useLatestActionNotification` query filters `is_read = false`. If mutation hasn't propagated AND a query refetch happens before the DB updates, notification A reappears briefly. More critically, the `useEffect` on L14-17 resets `dismissed` to `null` whenever `notification.id !== dismissed` — which is true when a completely **new** notification B arrives, which is correct behavior. But if the query returns the **same** notification before `markRead` completes in the DB, `notification.id === dismissed` correctly hides it. This is actually fine on closer inspection — the `markRead` mutation marks it as read, so subsequent queries won't return it.  
**Actual Status:** Working correctly. The query filters `is_read = false`, `markRead` sets `is_read = true`, and the local `dismissed` state handles the transient period. **No fix needed.**

---

### Issue 4: `ReorderLastOrder` Deletes Cart Even When `hasExistingCart=false`

**Severity:** Medium  
**Flow:** Buyer — Home Page  
**Reproduction:** User has an empty cart. Taps "Reorder". `handleReorder` checks for existing cart (L71-86), finds none, calls `executeReorder`. In `executeReorder` L147, `delete().eq('user_id', user.id)` runs on an already-empty cart — this is a harmless no-op but adds unnecessary latency.  
**Silent or Visible?** Silent — no user impact, just wasteful DB call.  
**Fix:** Skip delete if `!hasExistingCart`. Low priority.

---

### Issue 5: `BuyAgainRow` Creates Incomplete Product Object for `addItem`

**Severity:** Medium  
**Flow:** Buyer — Home Page  
**Reproduction:** User taps "+" on a Buy Again product. `handleQuickAdd` (L101-126) constructs a partial `Product` object with hardcoded `is_veg: true`, `category: '' as any`, empty `created_at/updated_at`. The `addItem` function in `useCart` checks `getInlineSellerAvailability(product)` which looks for `seller_availability_start` etc on the product — these are missing, so it falls through to fetch seller from DB. This works but relies on the fallback path.  
**Root Cause:** The constructed product is missing `image_urls` (has `image_url` singular), `approval_status`, and other fields. Since `addItem` handles the fallback gracefully, this isn't broken but is fragile.  
**Silent or Visible?** Silent — works via fallback.  
**Fix:** Ensure the product object includes `seller_id` (already does) so the DB fallback works. Current code is acceptable.

---

### Issue 6: `useArrivalDetection` useEffect Dependency on `societyRef.current?.lat`

**Severity:** Medium  
**Flow:** Buyer — Home Page  
**Reproduction:** The second `useEffect` (L46) has `societyRef.current?.lat` in its dependency array. React refs don't trigger re-renders, so this effect only runs on initial mount. If the society data loads after mount, the watch never starts.  
**Root Cause:** `useArrivalDetection.ts` L100 — `societyRef.current?.lat` as a dependency is meaningless since ref mutations don't cause re-renders. The first `useEffect` sets `societyRef.current` async, but the second effect has already run with `societyRef.current === null` and returned early at L47.  
**Silent or Visible?** Silent — arrival detection never activates. `ArrivalSuggestionCard` never shows.  
**Fix:** Convert `societyRef` to `useState` so the second effect re-runs when society data loads. Or merge both effects into one.

---

### Issue 7: `useCartPage` Payment Session Restore May Show Empty Payment Sheet

**Severity:** Medium  
**Flow:** Buyer — Checkout (App Resume)  
**Reproduction:** User starts UPI payment, switches to payment app, comes back. `loadPaymentSession` restores `pendingOrderIds`. `setShowUpiDeepLink(true)` fires after 100ms. But `sellerGroups` may be empty (cart already cleared or still loading), so `c.sellerGroups[0]?.items[0]?.product?.seller?.upi_id` resolves to `undefined`, passed to `UpiDeepLinkCheckout` as empty `sellerUpiId`.  
**Root Cause:** `useCartPage.ts` L85-89 — session restoration doesn't verify that cart data is still loaded. The `UpiDeepLinkCheckout` component receives an empty `sellerUpiId`.  
**Silent or Visible?** Potentially visible — UPI sheet opens but can't generate payment link.  
**Fix:** Store `sellerUpiId` and `sellerName` in the payment session. Use stored values as fallback when `sellerGroups` is empty.

---

### Issue 8: `quick-reorder` Edge Function Uses `status` Instead of `approval_status`

**Severity:** High  
**Flow:** Buyer — Reorder  
**Reproduction:** The edge function filters products with `p.status === 'approved'` (L89). But the `products` table uses `approval_status`, not `status`. The `.select()` on L86 fetches `status` which likely doesn't exist as a column, meaning all products pass the filter OR none do.  
**Root Cause:** `supabase/functions/quick-reorder/index.ts` L86-89 — selects wrong column name.  
**Silent or Visible?** Silent — either all products appear available (if `status` returns null) or none do.  
**Fix:** Change `status` to `approval_status` in both the select and filter.

---

### Issue 9: No Concurrent Order Protection in `quick-reorder` Edge Function

**Severity:** High  
**Flow:** Buyer — Home Page  
**Reproduction:** User rapidly taps "Reorder" button. `SmartSuggestionBanner` has `reorderingId` which disables the button for that suggestion, BUT two different suggestions could be tapped quickly, each creating orders simultaneously. No server-side dedup.  
**Root Cause:** No idempotency key or rate limiting in `quick-reorder`. The client-side `reorderingId` only guards one suggestion at a time.  
**Silent or Visible?** Silent — duplicate orders created.  
**Fix:** Add a mutex ref to `SmartSuggestionBanner` that blocks ALL reorders while one is in-flight, not just per-suggestion.

---

### Issue 10: `useCartPage` Price Validation Race — Cart Refresh After Mismatch Doesn't Block Re-submission

**Severity:** Medium  
**Flow:** Buyer — Checkout  
**Reproduction:** Price changes detected at L170-174. `refresh()` is called but `setIsPlacingOrder(false)` is NOT called — it's set in the outer `finally` block. But the function `throw`s after `refresh()`, which is caught in the outer try-catch, which does call `setIsPlacingOrder(false)`. However, `useSubmitGuard` has a 3-second cooldown. If user taps again within 3 seconds, the guard blocks it silently.  
**Actual Status:** Working as designed — guard + toast + refresh is correct behavior. **No fix needed.**

---

### Prioritized Fix Plan

**Phase 1 — Critical:**
1. **Rewrite `quick-reorder` edge function** — fix RPC parameter names (`_` prefix), restructure items into `_seller_groups` format, fix `status` → `approval_status`, add required params `_payment_method`/`_payment_status`
2. **Fix SmartSuggestionBanner error toast** — change `toast.success` to `toast.info` on reorder failure path

**Phase 2 — High:**
3. **Fix `useArrivalDetection` ref dependency** — convert `societyRef` to state so geolocation watch starts after society data loads
4. **Add global reorder mutex** to `SmartSuggestionBanner` — prevent concurrent reorders across different suggestions

**Phase 3 — Medium:**
5. **Store seller UPI details in payment session** — ensure app-resume can restore UPI sheet even when cart is empty
6. **Skip cart delete in `executeReorder`** when no existing cart items

---

### Files to Change

| File | Changes |
|------|---------|
| `supabase/functions/quick-reorder/index.ts` | Fix RPC params, column names, add payment params |
| `src/components/home/SmartSuggestionBanner.tsx` | Fix error toast, add global reorder mutex |
| `src/hooks/useArrivalDetection.ts` | Convert societyRef to useState |
| `src/hooks/useCartPage.ts` | Store seller details in payment session |
| `src/components/home/ReorderLastOrder.tsx` | Skip unnecessary cart delete |

---

### Top 10 Failures at 10,000 Daily Users

1. **Every "Reorder" from SmartSuggestionBanner fails** — RPC parameter mismatch (affects all users with suggestions)
2. **Arrival detection never triggers** — ref dependency bug means ArrivalSuggestionCard is dead code
3. **UPI payment sheet breaks on app resume** — missing seller UPI ID when cart is empty
4. **Duplicate orders from rapid suggestion taps** — no global mutex
5. **Stale cart data shown after price changes** — 5s stale time means brief window of wrong prices
6. **Concurrent status updates on busy orders** — two tabs/devices can desync (mitigated by affected-rows check)
7. **Notification queue edge function invoked on every order status change** — could hit rate limits at scale
8. **Live Activity orphans on iOS** — if app killed during delivery, activities may persist on lock screen
9. **Session storage payment recovery fails in incognito** — sessionStorage cleared on tab close in some browsers
10. **Cart sync across devices is eventual** — no realtime on cart_items means multi-device users see stale carts

