

## Round 2: Zero-Tolerance System Audit

### Issues Found

---

#### 1. SmartSuggestionBanner `handleReorder` Creates Orders Without Store Availability Check

**Severity:** Critical  
**Flow:** Buyer — Home Page  
**Reproduction:** User sees a smart suggestion for a product whose seller is now closed. Taps "Reorder". The `quick-reorder` edge function creates orders directly without checking store hours.  
**Root Cause:** `SmartSuggestionBanner.tsx` L20-54 — `handleReorder` invokes the `quick-reorder` edge function which bypasses all client-side availability checks. No `computeStoreStatus` call. No seller hours validation. The edge function likely creates orders for closed stores.  
**Silent or Visible?** Silent — order is created, user gets success toast, but seller may never see it or it sits in limbo.  
**Real-world Impact:** Orders placed against closed stores. Seller confusion. Buyer waits indefinitely.  
**Fix:** Before invoking `quick-reorder`, fetch seller availability and run `computeStoreStatus`. Block with toast if closed. Alternatively, add availability validation inside the `quick-reorder` edge function itself.

---

#### 2. SmartSuggestionBanner Uses `useToast` Instead of Sonner — Inconsistent Toast System

**Severity:** Medium  
**Flow:** Buyer — Home Page  
**Reproduction:** Tap "Reorder" on a smart suggestion. The toast looks different from every other toast in the app.  
**Root Cause:** `SmartSuggestionBanner.tsx` L9, L15 imports `useToast` from `@/hooks/use-toast` (shadcn toast system) while the entire app uses `sonner`. These are two different toast systems rendering in different positions with different styles.  
**Silent or Visible?** Visible — visual inconsistency, potential overlap/conflict between two toast systems.  
**Fix:** Replace `useToast` with `import { toast } from 'sonner'` and change calls to `toast.success(...)`.

---

#### 3. `useOrderSuggestions` N+1 Query Pattern — Sequential DB Calls Per Suggestion

**Severity:** Medium  
**Flow:** Buyer — Home Page Performance  
**Reproduction:** User with 3 suggestions triggers 7 DB queries (1 for suggestions + 2 per suggestion for product + seller enrichment).  
**Root Cause:** `useOrderSuggestions.ts` L46-63 — loops through each suggestion sequentially, making individual `supabase.from('products').select()` and `supabase.from('seller_profiles').select()` calls instead of batch `.in()` queries.  
**Silent or Visible?** Silent — slower page load, potential timeout on slow connections.  
**Fix:** Collect all `product_id`s and `seller_id`s, then batch fetch with `.in('id', productIds)` and `.in('id', sellerIds)`.

---

#### 4. `updateOrderStatus` Optimistic UI Without Checking Affected Rows

**Severity:** High  
**Flow:** Seller — Order Processing  
**Reproduction:** Two people (or auto-cancel trigger + seller) try to update the same order simultaneously. The `.eq('status', order.status)` guard correctly prevents DB update, but the query returns no error — it just updates 0 rows. The UI still shows the new status because of the optimistic `setOrder` on L151.  
**Root Cause:** `useOrderDetail.ts` L146-151 — After the update query with the concurrency guard, the code doesn't check if any rows were actually updated. Supabase `.update()` doesn't throw when 0 rows match. So `setOrder({ ...order, ...updateData })` runs even when the DB wasn't changed.  
**Silent or Visible?** Silent — UI shows wrong status until next refetch.  
**Fix:** Use `.select()` after `.update()` to get affected rows. If result is empty/null, refetch the order and show "Order status has changed" toast.

---

#### 5. COD Duplicate Guard Blocks Legitimate Multi-Order Users

**Severity:** High  
**Flow:** Buyer — Checkout  
**Reproduction:** User places a COD order from Seller A (status: pending, payment: pending). Then adds items from Seller B. Tries to place a second COD order. Blocked by the guard on L298-309 of `useCartPage.ts` which checks for ANY pending+pending order, not just orders for the same seller/items.  
**Root Cause:** `useCartPage.ts` L298-309 — The duplicate guard queries `orders` for `payment_status = 'pending'` and `status IN ('pending', 'accepted', 'confirmed')` without scoping to the current seller or cart items. A previous legitimate COD order blocks all future orders.  
**Silent or Visible?** Visible — user sees "You have an unpaid order pending" but it's a false positive.  
**Fix:** Either remove the COD duplicate guard entirely (COD orders don't need payment dedup — they're confirmed on creation), or scope it to the same seller group. COD orders should set `payment_status` to something other than `pending` (e.g., `cod_pending`) to distinguish from actual unpaid UPI orders.

---

#### 6. `UpcomingAppointmentBanner` Shows Bookings With `start_time` Comparison Using String Sort

**Severity:** Medium  
**Flow:** Buyer — Home Page  
**Reproduction:** User has a booking today at 9:00 AM. Current time is 9:30 AM. The filter on L57 compares `b.start_time < currentTimeStr` using string comparison. Times like "9:00:00" vs "09:30:00" — if stored without leading zero, this comparison breaks.  
**Root Cause:** `UpcomingAppointmentBanner.tsx` L54-58 — String comparison of time values. `format(now, 'HH:mm:ss')` always produces zero-padded output, but `start_time` from DB may not be zero-padded (Postgres `time` type can return "9:00:00").  
**Silent or Visible?** Silent — past appointments may show, or current appointments may be filtered out.  
**Fix:** Pad the `start_time` from DB before comparison, or parse both into minutes-since-midnight for numeric comparison.

---

#### 7. `HomeNotificationBanner` Dismiss Is Not Persisted — Reappears on Navigation

**Severity:** Medium  
**Flow:** Buyer — Home Page  
**Reproduction:** User dismisses notification banner. Navigates to another page. Returns to home. Banner reappears because `dismissed` state is component-local (`useState`), and the `useEffect` on L13-16 resets it when `notification.id !== dismissed`.  
**Root Cause:** `HomeNotificationBanner.tsx` L7 — `dismissed` is local React state. On remount (page navigation back to home), state resets. The `useEffect` on L13 also actively clears dismissed when notification ID changes, but the component remounts with `dismissed = null`.  
**Silent or Visible?** Visible — user keeps seeing the same notification they dismissed.  
**Fix:** Either mark notification as read via `useMarkNotificationRead` on dismiss, or persist dismissed IDs in `sessionStorage`.

---

#### 8. `ArrivalDetection` Starts Geolocation Watch Without Explicit User Permission Check

**Severity:** Low  
**Flow:** Buyer — Home Page  
**Reproduction:** User hasn't granted location permission. `useArrivalDetection` calls `navigator.geolocation.watchPosition` which triggers browser permission prompt unexpectedly when landing on home page.  
**Root Cause:** `useArrivalDetection.ts` L48-50 — calls `navigator.geolocation` without checking `permissions.query({ name: 'geolocation' })` first. On web, this triggers the permission popup. On native, Capacitor has its own flow.  
**Silent or Visible?** Visible — unexpected location permission popup on home page load.  
**Fix:** Check permission state first via `navigator.permissions.query`. Only start watching if already `'granted'`.

---

#### 9. Admin Seller Approval: Products Approved Without Individual Review

**Severity:** Medium  
**Flow:** Admin  
**Reproduction:** Admin approves a seller. Line 186 of `useSellerApplicationReview.ts` auto-approves ALL pending/draft products: `update({ approval_status: 'approved' }).eq('seller_id', seller.id).in('approval_status', ['pending', 'draft'])`. A seller could add a problematic product just before approval.  
**Root Cause:** Batch approval is a design choice, but it bypasses individual product review. No content moderation check.  
**Silent or Visible?** Silent — inappropriate products go live immediately.  
**Fix:** Either keep batch approval but log it for audit, or change to approve only products that existed at review time (add `created_at` filter). At minimum, show a count confirmation: "This will approve X products."

---

#### 10. Seller `togglePauseShop` Has No Debounce — Rapid Clicks Toggle Back and Forth

**Severity:** Medium  
**Flow:** Seller — Settings  
**Reproduction:** Seller rapidly taps the pause/resume toggle. Each click sends an update to DB. UI state and DB can desync if requests arrive out of order.  
**Root Cause:** `useSellerSettings.ts` L104-113 — `togglePauseShop` has no mutex or loading state. Optimistic UI update + async DB call means rapid taps can produce: UI=paused → DB=paused → UI=open → DB=open, but if the second DB call resolves first, final state is random.  
**Silent or Visible?** Silent — store may end up in wrong state.  
**Fix:** Add `isSaving` guard or a `useRef` mutex to prevent concurrent toggles.

---

#### 11. ReorderLastOrder Deletes Cart Before Confirming Availability of ALL Items

**Severity:** High  
**Flow:** Buyer — Home Page  
**Reproduction:** User has items in cart. Confirms "Replace Cart". `executeReorder` deletes all cart items (L136), then checks product availability. If ALL products are unavailable (L127-130), the user's original cart is gone AND no new items are added. Cart is permanently empty.  
**Root Cause:** `ReorderLastOrder.tsx` L136 — `await supabase.from('cart_items').delete().eq('user_id', user.id)` runs before the insert. The availability check happens before delete (L98-125), but it only checks if the store is open, not individual product availability. The `availableSet` could be empty if products were deleted between the two queries.  
**Silent or Visible?** Partially visible — user gets "items unavailable" toast but original cart is already deleted.  
**Fix:** Move the delete to AFTER confirming at least some items can be inserted. Or wrap delete+insert in a transaction-like pattern: insert first, then delete old items.

---

### Prioritized Fix Plan

**Phase 1 — Critical:**
1. SmartSuggestionBanner: Add store availability check before `quick-reorder` invocation
2. COD duplicate guard: Remove or scope to prevent false positives blocking legitimate orders
3. ReorderLastOrder: Don't delete cart until insert items are confirmed

**Phase 2 — High:**
4. `updateOrderStatus`: Check affected rows after concurrency-guarded update
5. SmartSuggestionBanner: Switch from `useToast` to `sonner`
6. Seller `togglePauseShop`: Add mutex guard

**Phase 3 — Medium:**
7. `HomeNotificationBanner`: Persist dismiss via `markNotificationRead`
8. `UpcomingAppointmentBanner`: Fix time comparison to handle non-padded times
9. `useOrderSuggestions`: Batch DB queries instead of N+1
10. Admin product approval: Add confirmation count or created_at filter
11. ArrivalDetection: Check permission before starting watch

### Files to Change

| File | Changes |
|------|---------|
| `src/components/home/SmartSuggestionBanner.tsx` | Add availability check, switch to sonner |
| `src/hooks/useCartPage.ts` | Fix COD duplicate guard scope |
| `src/components/home/ReorderLastOrder.tsx` | Reorder delete/insert sequence |
| `src/hooks/useOrderDetail.ts` | Check affected rows on update |
| `src/hooks/useSellerSettings.ts` | Add toggle mutex |
| `src/components/notifications/HomeNotificationBanner.tsx` | Persist dismiss |
| `src/components/home/UpcomingAppointmentBanner.tsx` | Fix time comparison |
| `src/hooks/useOrderSuggestions.ts` | Batch queries |
| `src/hooks/useArrivalDetection.ts` | Check permission first |

