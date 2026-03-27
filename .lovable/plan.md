

# Buyer In-App Notification System — 5 Critical Bugs

---

## Bug 1: Infinite Re-fetch Loop from Stale Cleanup Inside Query

**Issue:** `useNotifications` (line 104-108) runs `cleanupStaleDeliveryNotifications` inside the `queryFn` on every first-page fetch. This function marks stale notifications as read, then calls `queryClient.invalidateQueries({ queryKey: ['notifications', userId] })` — which triggers the same `queryFn` again. If any stale notifications exist, this creates a fetch → cleanup → invalidate → fetch → cleanup loop that only stops when all stale items are marked read. Each cycle fires 1 list query + 1 orders query + 1 update mutation.

**Why critical (buyer trust):** The buyer's notification inbox flickers/reloads repeatedly on open. On slow connections this manifests as a loading spinner that won't settle. Every re-fetch also resets scroll position, making infinite scroll unusable. On cellular networks, this burns data and battery.

**Affected modules:**
- `NotificationInboxPage` — visual flicker, scroll reset
- `useUnreadNotificationCount` — badge count oscillates as stale items get marked read mid-render
- React Query cache — unnecessary cache churn across all notification queries
- Network — 2-6x more API calls per inbox open

**Fix:** Move stale cleanup out of `queryFn`. Run it as a one-time effect in `NotificationInboxPage` (or a dedicated `useEffect`) triggered by the first successful data fetch, using a ref guard to ensure it fires only once per mount. The cleanup result should invalidate queries only if it actually marked items.

**Risk from fix:** If cleanup is moved to component-level, it won't run when queries are refetched in the background (e.g., 30s polling). This is actually desirable — stale cleanup is a one-time reconciliation, not a polling task. No regression.

---

## Bug 2: RichNotificationCard in Inbox Has No `onDismiss` — Action Buttons Are Dead-Ends

**Issue:** In `NotificationInboxPage` (line 72-75), when a notification has an action, it renders `<RichNotificationCard notification={n} />` with **no `onDismiss` prop**. Inside `RichNotificationCard`, the action button calls `handleAction()` which navigates and calls `onDismiss?.()` — but since `onDismiss` is undefined, the card stays visible after navigation. More critically, if `referencePath` is falsy (no `reference_path` and no `payload.reference_path`), the action button calls `onDismiss?.()` which is a no-op — **the button does literally nothing**. The buyer taps "View Order" and nothing happens.

**Why critical (buyer trust):** A buyer receives "Your order is ready for pickup" with a "View Order" button. If the notification's `reference_path` is null (which happens when the trigger function doesn't set it), tapping the button has zero effect. The buyer sees an actionable card that is completely non-functional. This is the highest-visibility notification surface.

**Affected modules:**
- `NotificationInboxPage` — broken action buttons
- `RichNotificationCard` — needs fallback navigation using `resolveNotificationRoute`
- Buyer order tracking flow — buyer can't navigate to order from notification

**Fix:** 
1. Pass `onDismiss` callback to `RichNotificationCard` in the inbox that marks the notification read.
2. In `RichNotificationCard.handleAction`, if `referencePath` is falsy, fall back to `resolveNotificationRoute(notification.type, notification.payload)`.

**Risk from fix:** Adding `onDismiss` to inbox cards means dismissed cards disappear from the list. This is correct behavior — the card is marked read and should visually update. Need to ensure the list re-renders correctly (optimistic update or invalidation handles this already).

---

## Bug 3: Unread Badge Count Desynchronizes from Inbox Due to Separate Query + Stale Cleanup Race

**Issue:** `useUnreadNotificationCount` runs its own independent query (count of unread, excluding seller types). Meanwhile, `useNotifications`'s stale cleanup silently marks notifications as read. The badge count query has a 30s `staleTime` — so after cleanup marks items read, the badge still shows the old count for up to 30 seconds. Worse, `useBuyerOrderAlerts` invalidates `['unread-notifications']` on every order status change, but the invalidation uses a partial key `['unread-notifications']` while the actual query key is `['unread-notifications', user?.id]`. **Partial key matching works in React Query** (prefix match), so this isn't a mismatch per se — but the real issue is the 30s staleness window where badge and inbox disagree.

**Why critical (buyer trust):** Buyer dismisses a notification in the inbox → badge still shows "3" instead of "2" for 30 seconds. Or stale cleanup marks 5 items read → badge shows "5" while inbox shows "0 unread." This inconsistency makes the notification system feel broken and unreliable.

**Affected modules:**
- Bottom navigation badge — shows wrong count
- `HomeNotificationBanner` — may show a notification that was already auto-cleaned
- `useMarkNotificationRead` / `useMarkAllNotificationsRead` — these correctly invalidate, but compete with stale cleanup's silent writes

**Fix:** After stale cleanup marks items read, explicitly invalidate `['unread-notifications']` in addition to `['notifications']`. Also reduce `staleTime` on the unread count query to 5-10 seconds (or 0 and rely on `refetchInterval` alone for polling).

**Risk from fix:** Reducing `staleTime` increases query frequency slightly. Acceptable since it's a `head: true` count query (no data transfer). The alternative — optimistic cache updates — is more complex and error-prone.

---

## Bug 4: `useLatestActionNotification` Performs Write Mutations Inside a Read Query — Violates Query Contract

**Issue:** `useLatestActionNotification` (lines 184-191) performs a Supabase `UPDATE` (marking stale notifications as read) inside a `useQuery` `queryFn`. React Query expects `queryFn` to be a pure read operation. This mutation inside a query means:
- Every 30-second refetch (line 212) potentially writes to the database
- Background refetches triggered by window focus also trigger writes
- If the query retries on error, the write may execute multiple times
- The write changes data that other queries depend on, but those queries aren't invalidated from here

**Why critical (buyer trust):** Notifications silently disappear from the inbox without the buyer dismissing them. A buyer returns to the app, and notifications they haven't seen are already marked as read. The "unread" blue dot and banner vanish before the buyer reads them. This is especially bad for order status updates — the buyer may miss that their order was cancelled.

**Affected modules:**
- `HomeNotificationBanner` — notification disappears before buyer sees it
- `NotificationInboxPage` — notifications appear as "read" without buyer interaction
- `useUnreadNotificationCount` — count drops without buyer action
- Any future notification analytics — read rates are artificially inflated

**Fix:** Extract the stale-marking logic from `queryFn` into a separate `useMutation` or standalone effect that runs once on component mount. The query should be read-only. The stale-marking should only fire on explicit app resume (via `useAppLifecycle`), not on every polling cycle.

**Risk from fix:** Terminal-order notifications may linger longer in the inbox as "unread." This is actually better UX — the buyer should see them at least once. If needed, the cleanup can run on app resume only (which `useAppLifecycle` already handles for other queries).

---

## Bug 5: `AnimatePresence` in `HomeNotificationBanner` Never Triggers Exit Animation

**Issue:** In `HomeNotificationBanner` (lines 57-71), `AnimatePresence` wraps a `motion.div` that is conditionally rendered via the early return on line 54: `if (!notification || localDismissed.has(notification.id)) return null`. When the notification is dismissed, the component returns `null` **before** reaching `AnimatePresence`. This means `AnimatePresence` is never rendered with its children removed — it's simply unmounted entirely. The `exit` animation (`opacity: 0, y: -12`) **never plays**. The banner just vanishes instantly.

**Why critical (buyer trust):** The notification banner disappears with a hard cut instead of a smooth slide-out. On a polished mobile app, this feels broken and jarring. Combined with Bug 2 (action buttons doing nothing), the notification system feels unfinished. This is the first thing buyers see on the home screen.

**Affected modules:**
- `HomeNotificationBanner` — no exit animation
- Home page UX — visual jank on dismiss

**Fix:** Move the conditional logic inside `AnimatePresence`. Always render `AnimatePresence`, and conditionally render the `motion.div` child inside it:
```tsx
return (
  <AnimatePresence>
    {notification && !localDismissed.has(notification.id) && (
      <motion.div key={notification.id} ... >
        <RichNotificationCard ... />
      </motion.div>
    )}
  </AnimatePresence>
);
```

**Risk from fix:** None. This is a standard `AnimatePresence` pattern. The component always mounts, but only renders children when there's a visible notification.

---

## Impact Analysis — What Gets Affected If All 5 Are Fixed

| Module | Impact | Risk Level |
|--------|--------|------------|
| `useNotifications` queryFn | Becomes pure read (no side effects). Polling is lighter. | Low — additive |
| `useLatestActionNotification` queryFn | Becomes pure read. Stale cleanup moves to lifecycle. | Low — behavioral change is better UX |
| `useUnreadNotificationCount` | Badge syncs faster with actual state. | None |
| `NotificationInboxPage` | Cards have working action buttons. No more flicker. | Low — test navigation from all notification types |
| `HomeNotificationBanner` | Smooth exit animation. No phantom banners. | None |
| `useAppLifecycle` | May need to host the stale cleanup logic (single responsibility). | Low — already handles resume invalidation |
| `useBuyerOrderAlerts` | No change needed — already correct. | None |
| React Query cache | Fewer spurious invalidations = more stable renders. | None |
| Push notification foreground handler | No change — operates independently. | None |

## Implementation Order (surgical, production-safe)

1. **Bug 5** — AnimatePresence fix (2 min, zero risk, instant visual improvement)
2. **Bug 2** — Inbox RichNotificationCard action fallback + onDismiss (10 min, high-value fix)
3. **Bug 1** — Extract stale cleanup from queryFn into mount-once effect (15 min)
4. **Bug 4** — Extract writes from useLatestActionNotification queryFn (15 min, pairs with Bug 1)
5. **Bug 3** — Badge staleTime reduction + explicit invalidation after cleanup (5 min, depends on Bug 1/4)

Total: ~47 minutes of surgical changes. No new features. No refactoring. All fixes are additive or extractive — no existing behavior is removed, only corrected.

