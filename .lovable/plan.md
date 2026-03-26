

# Notification, Live Activity & Search — 10 Critical Production Bugs

## Bug 1: Notification Inbox Query Mutates Data Inside `queryFn`

**Where:** `src/hooks/queries/useNotifications.ts` lines 64-86 (`useNotifications`)

**What:** The `queryFn` performs `supabase.update()` calls (marking stale delivery notifications as read) inside a React Query fetch function. This is a side effect inside a read operation — it runs on every refetch (every 30s), every window focus, and every mount. If the update fails, it throws and the entire notification list fails to render.

**Why Critical:** Every 30 seconds, the inbox query fires DB writes. If RLS or network hiccups cause the update to fail, the user sees a blank notification inbox. Additionally, `staleTime: 0` means every component mount re-runs these writes.

**Fix:** Move the stale-cleanup logic into `onSuccess` or a separate `useMutation` that fires once per stale detection. The `queryFn` should only read.

**Risk:** Zero — the cleanup still runs, just not inside the query's critical path.

---

## Bug 2: `useLatestActionNotification` Also Mutates Inside `queryFn`

**Where:** `src/hooks/queries/useNotifications.ts` lines 144-148

**What:** Same pattern as Bug 1. The "latest action notification" query batch-marks stale notifications as read inside `queryFn`. This runs every 30s. If the update call throws, the home banner crashes.

**Why Critical:** The `HomeNotificationBanner` depends on this query. A failed write inside the read path hides all actionable notifications from the home screen.

**Fix:** Extract the stale-marking into a fire-and-forget call wrapped in try/catch, or move to `onSuccess`.

**Risk:** Zero.

---

## Bug 3: Duplicate In-App Notifications From Concurrent Queue Triggers

**Where:** `supabase/functions/process-notification-queue/index.ts` lines 136-155

**What:** The `queue_item_id` unique constraint on `user_notifications` prevents exact duplicates. But the dedup only works per queue item. If two separate queue items are enqueued for the same event (e.g., order status trigger fires twice due to rapid updates), two distinct `user_notifications` rows are created with different `queue_item_id` values. The user sees duplicate notifications for the same event.

**Why Critical:** Buyer sees "Order Confirmed" twice or "Driver arriving!" twice in their inbox. Erodes trust.

**Fix:** Add a partial unique index on `user_notifications (user_id, type, reference_path)` for recent time windows, OR add dedup logic in the queue processor that checks for existing notifications with same `(user_id, type, reference_path)` created within the last 60 seconds before inserting.

**Risk:** Low — needs a DB migration for the dedup index. Existing data unaffected (index is partial/conditional).

---

## Bug 4: Foreground Push Suppression Blocks Terminal Sync Dispatch

**Where:** `src/hooks/usePushNotifications.ts` lines 363-367

**What:** When a push arrives while the buyer is viewing the order page (`currentPath.includes(/orders/${orderId})`), the entire handler returns early at line 374. But the terminal-push dispatch at lines 356-361 only fires for the synchronous `isTerminal` path. The async path (lines 346-354) schedules a `.then()` that may resolve AFTER the early return. If the push has `is_terminal: true` explicitly, the sync dispatch fires before the suppression check — this is fine. But if the push only has a `status` field (no `is_terminal` flag), the terminal detection is async via `getTerminalStatuses()`, and the `order-terminal-push` event fires in a detached `.then()` which is unaffected by the return. So this is actually safe — but the self-action suppression at line 374 also skips the toast, meaning the buyer on the order page gets NO feedback that the order reached a terminal state (delivered/completed). The order detail page relies on realtime or polling to update.

**What breaks:** If realtime is down and the buyer is staring at the order page, they get a push notification but it's silently swallowed. No toast, no sound, no visual update until the next 15s polling heartbeat.

**Fix:** When suppressing for self-action, still dispatch a `order-detail-refetch` event so the order detail page immediately re-fetches, rather than waiting for the polling cycle.

**Risk:** Zero — adds an event dispatch before the return.

---

## Bug 5: ActiveOrderStrip Shows Expired `auto_cancel_at` Countdown After Cancellation

**Where:** `src/components/home/ActiveOrderStrip.tsx` lines 212-213

**What:** The countdown timer shows for any order where `auto_cancel_at` is set AND `status === 'placed'`. But when the auto-cancel cron runs and changes status to `cancelled`, there's a race window where the realtime event hasn't arrived yet. During this window, the strip shows "Expired" (countdown reaches 0) but the order card is still clickable and shows "Placed" status. Tapping it navigates to a cancelled order.

**Why Critical:** Buyer sees "Expired" on the strip, taps it, and sees a cancelled order — confusion about what happened.

**Fix:** When `CompactCountdown` reaches 0, fire a query invalidation for `active-orders-strip` to re-fetch and remove the now-cancelled order. Also, filter out orders where `auto_cancel_at` is in the past in the query itself.

**Risk:** Zero — adds a timeout-triggered refetch.

---

## Bug 6: Notification Inbox Limited to 50 — No Pagination or "Load More"

**Where:** `src/hooks/queries/useNotifications.ts` line 46, `src/pages/NotificationInboxPage.tsx`

**What:** The query fetches `.limit(50)` and the inbox page renders all of them with no pagination. Users with active order histories will hit this cap quickly. Older notifications silently vanish — the user thinks they have no history.

**Why Critical:** Buyer looks for a past order notification from yesterday — it's been pushed out by newer ones. No way to scroll further or load more.

**Fix:** Convert to `useInfiniteQuery` with cursor-based pagination (using `created_at` as cursor, same pattern as `useSellerOrdersInfinite`). Add a "Load more" button at the bottom of the inbox.

**Risk:** Low — pagination pattern already exists in the codebase.

---

## Bug 7: Search Autocomplete Doesn't Fetch `action_type` — Bookable Services Clickable As Products

**Where:** `src/components/search/SearchAutocomplete.tsx` lines 88-94, 204-220

**What:** The product search query doesn't select `action_type`. When a user clicks a bookable service from search results, `onSelect` is called with `product_id`, which opens `ProductDetailSheet`. The detail sheet may show "Add to Cart" for a bookable service (same bug pattern as BuyAgainRow, already fixed there but not in search).

**Why Critical:** Buyer adds a bookable service to cart from search, proceeds to checkout, gets a broken order.

**Fix:** Add `action_type` to the search query select. In `onSelect`, include `action_type` in the passed object. The `ProductDetailSheet` should already handle routing based on `action_type` (if it was fixed in the previous round — verify).

**Risk:** Zero — adding a field to the select.

---

## Bug 8: `HomeNotificationBanner` localStorage Dismissed IDs Never Expire

**Where:** `src/components/notifications/HomeNotificationBanner.tsx` lines 22-30

**What:** `addDismissedId` caps at 50 entries but never expires old ones. After 50 dismissed notifications, the oldest dismissals are evicted (`.slice(-MAX_STORED)`). But the real issue: dismissed IDs persist in localStorage forever. If a notification is dismissed, marked as read in DB, and later the user clears their notification data or a new actionable notification arrives with a recycled pattern, the localStorage set could theoretically mask it. More practically: the `getDismissedIds` runs on every render and parses JSON from localStorage — on low-end devices with 50 entries, this is negligible but unnecessary. The real bug is that `useLatestActionNotification` returns a single notification, and if that one is dismissed locally, NO fallback is shown even if there are other actionable notifications.

**Why Critical:** User dismisses the top actionable notification → `useLatestActionNotification` still returns the same one (it's unread in DB until the async `markRead` completes) → banner stays hidden → user misses the NEXT actionable notification until the dismissed one is marked read and the query re-runs.

**Fix:** After dismissing, immediately invalidate the `latest-action-notification` query so it re-fetches and potentially returns the next actionable notification.

**Risk:** Zero — adding query invalidation on dismiss.

---

## Bug 9: Notification Preference Check Doesn't Cover Delivery/Booking Types

**Where:** `supabase/functions/process-notification-queue/index.ts` lines 99-106

**What:** The preference check only maps `order`, `order_status`, `order_update` → `orders` pref, `chat` → `chat`, `promotion` → `promotions`. Delivery notifications (`delivery_en_route`, `delivery_proximity`, `delivery_proximity_imminent`, `delivery_stalled`, `delivery_delayed`) and booking reminders (`booking_reminder_*`) are NOT mapped. If a user opts out of "orders", they still receive delivery push notifications because the type doesn't match any preference key — `prefAllowed` stays `true`.

**Why Critical:** User who opted out of order notifications still gets buzzed for delivery updates. Violates user's explicit preference.

**Fix:** Map delivery types (`delivery_*`) and booking types (`booking_*`) to the `orders` preference. Or add a separate `delivery` preference if needed.

**Risk:** Low — expanding the type-to-preference mapping.

---

## Bug 10: Live Activity Orchestrator `lastProcessedEvents` Map Leaks Memory for Non-Terminal Orders

**Where:** `src/hooks/useLiveActivityOrchestrator.ts` lines 16, 107-114

**What:** `lastProcessedEvents` is a module-level `Map` that stores `orderId → eventKey`. Entries are only deleted when an order reaches a terminal status (line 114). For long-running orders (e.g., scheduled bookings days away), the entry persists indefinitely. If the user has many orders over time, this map grows unbounded. Additionally, since it's module-level (not per-user), switching accounts doesn't clear it — stale dedup keys from User A could theoretically suppress events for User B if order IDs overlap (extremely unlikely with UUIDs, but architecturally unsound).

**Why Critical:** Memory leak on long sessions. On mobile devices with limited RAM, this can cause the app to slow down or crash after extended use.

**Fix:** Add a periodic cleanup (e.g., every 5 minutes, evict entries older than 10 minutes based on a timestamp). Or clear the map when `userId` changes.

**Risk:** Zero — adding cleanup logic to an existing map.

---

## Priority Order

| # | Bug | Impact | Effort |
|---|-----|--------|--------|
| 1 | Bug 7 | Bookable services in cart via search | Tiny — add field |
| 2 | Bug 1 | Inbox crash on write failure | Small — move writes out of queryFn |
| 3 | Bug 2 | Home banner crash | Small — same pattern as Bug 1 |
| 4 | Bug 4 | Silent terminal push on order page | Tiny — add event dispatch |
| 5 | Bug 9 | Preference bypass for delivery pushes | Tiny — expand mapping |
| 6 | Bug 5 | Expired countdown confusion | Small — add timeout refetch |
| 7 | Bug 8 | Missed next actionable notification | Tiny — add invalidation |
| 8 | Bug 3 | Duplicate notifications | Medium — DB migration |
| 9 | Bug 10 | Memory leak | Small — add cleanup |
| 10 | Bug 6 | No inbox pagination | Medium — infinite query |

## Files to Change

| File | Bugs |
|------|------|
| `src/hooks/queries/useNotifications.ts` | 1, 2 |
| `src/components/search/SearchAutocomplete.tsx` | 7 |
| `src/hooks/usePushNotifications.ts` | 4 |
| `src/components/home/ActiveOrderStrip.tsx` | 5 |
| `src/components/notifications/HomeNotificationBanner.tsx` | 8 |
| `supabase/functions/process-notification-queue/index.ts` | 3, 9 |
| `src/hooks/useLiveActivityOrchestrator.ts` | 10 |
| `src/pages/NotificationInboxPage.tsx` | 6 |
| DB migration | 3 |

