

## In-App Notification System — Critical QA Audit (Buyer Perspective)

### Top 5 Bugs Found

---

### Bug 1 (P0): Auto-Dismiss Trigger Uses Wrong Notification Types — Delivery Notifications Never Auto-Cleared

**Issue:** The `auto_dismiss_delivery_notifications` trigger checks for types `delivery_location_update` and `delivery_at_gate`, but these types DO NOT EXIST anywhere in the system. The actual delivery notification types are: `delivery_en_route`, `delivery_proximity`, `delivery_proximity_imminent`, `delivery_stalled`, `delivery_delayed`. The trigger matches zero rows and silently does nothing.

**Why critical:** When an order reaches `delivered`/`completed`, stale delivery alerts remain unread in the buyer's inbox and continue showing in the HomeNotificationBanner. The client-side cleanup in `useNotifications` partially compensates (it checks order status for delivery types), but this only works when the inbox is opened — not proactively. The badge count stays inflated.

**Impact:** Unread count badge shows stale count. HomeNotificationBanner may show outdated delivery alerts. Buyer sees "Your order is on the way" after it's already delivered.

**Risk of fixing:** None — purely corrective. The client-side cleanup already handles these exact types, so making the DB trigger match is strictly additive.

**Fix:** Update the trigger to use correct type names:
```sql
AND type IN ('delivery_en_route', 'delivery_proximity', 'delivery_proximity_imminent', 'delivery_stalled', 'delivery_delayed')
```

---

### Bug 2 (P1): `notification_action` Lookup Skips Default Fallback — Action Button Missing for Non-Default Parent Groups

**Issue:** In `fn_enqueue_order_status_notification` (line 191-198 of latest migration), the `action` field in the buyer notification payload queries `category_status_flows` using `COALESCE(v_parent_group, 'default')` — but this does NOT use the fallback logic. If a `food_beverages/seller_delivery` flow row exists but has `notification_action = NULL`, the COALESCE returns `'View Order'`. However, if the primary lookup found the title via the default fallback (lines 142-158), the action sub-query still queries the original `v_parent_group` which may have no `notification_action` set. Result: the action defaults to `'View Order'` always, which is benign but loses any custom actions configured on `default` flows.

**Why critical:** Medium impact — the fallback to `'View Order'` is acceptable but means custom notification actions (like "Track Delivery" for `on_the_way` status) configured on the `default` parent group are never surfaced when the order belongs to a category-specific group.

**Impact:** Buyer always sees generic "View Order" button instead of contextual actions like "Track Delivery" or "Confirm Receipt".

**Risk of fixing:** Low — purely a lookup path fix.

**Fix:** Change the action sub-query to use `v_lookup_group` with the same fallback pattern, or better: store the resolved `notification_action` from the primary/fallback lookup alongside the other fields.

---

### Bug 3 (P1): `settlement` Notification Type Has No Route Resolver — Tapping Leads to `/notifications` Dead End

**Issue:** The `resolveNotificationRoute` function has no case for `settlement` type. There are 6 settlement notifications in the current user's inbox. When tapped, these fall through to `default: return '/notifications'` — which navigates the user right back to the same page. The `reference_path` is `/seller/settlements`, which IS correct and works, but only because the inbox code uses `n.reference_path` first. However, `RichNotificationCard` (used for unread notifications with actions) also uses `notification.reference_path`, so this works there too.

**Why critical:** For buyers, settlement notifications are seller-facing and should not appear in their inbox at all. This user (`ef690ff1`) is seeing settlement notifications because they are ALSO a seller. The real bug is: settlement notifications are sent to the seller's `user_id` but the notification inbox doesn't separate buyer vs seller notifications. A pure buyer would never see these, but dual-role users get a confusing mix.

**Impact:** Dual-role users see seller-specific notifications (settlements) in their buyer notification feed, creating confusion about what role they're in.

**Risk of fixing:** Medium — adding role-based filtering could accidentally hide legitimate notifications.

**Fix:** Add `settlement` to the route resolver. For the role-mixing issue, add a `role` field to the notification payload and filter in `useNotifications` based on the current active role context.

---

### Bug 4 (P1): Duplicate Notifications for Same Order — `placed` Type (`order`) Lacks Dedup Against Status Updates (`order_status`)

**Issue:** The DB trigger uses a 30-second dedup window matching on `title + orderId`. But there are TWO distinct notification sources for order placement: (1) the `fn_enqueue_order_status_notification` trigger fires with type `order_status` on status change, and (2) there's a separate `placed` notification with type `order` (from a different trigger or the RPC). These have DIFFERENT titles ("🆕 New Order Received!" vs the status flow title), so the dedup doesn't catch them. Result: the seller gets duplicate notifications for the same order placement event.

Looking at the data: for order `4beeee28`, there are TWO notifications — one `order` type ("New Order Received!") and one `order_status` type ("Order Cancelled") — this is correct (different events). But examining the notification counts: 20 `order` type + 11 `order_status` type for a user who is a seller. The `order` type notifications appear to be from the original order placement trigger, while `order_status` comes from status changes. This creates notification noise.

**Why critical:** Buyers/sellers receive redundant notifications for the same event, eroding trust in the system's accuracy.

**Impact:** Inflated unread counts, duplicate push notifications, notification fatigue.

**Risk of fixing:** Must ensure at least one notification fires reliably — removing the wrong one could cause missed notifications.

**Fix:** Audit and consolidate the two triggers. The `order` type notifications for `placed` status should be the same as the `order_status` notification from the trigger. Remove the duplicate source or extend the dedup to match on `orderId` regardless of title.

---

### Bug 5 (P2): Home Banner (`useLatestActionNotification`) Only Shows Notifications With `action` Field — Most Status Updates Invisible

**Issue:** The `useLatestActionNotification` hook at line 143 filters: `if (!n?.payload?.action) continue`. The `fn_enqueue_order_status_notification` trigger always sets `action` to either the flow's `notification_action` or `'View Order'` fallback. So this should work. However, the OLDER `order` type notifications (from the separate placement trigger) do NOT have an `action` field in their payload — they only have `{type, status, orderId}`. These notifications will never appear in the home banner.

**Why critical:** If the order_status trigger fails (e.g., missing flow data for a new category), the buyer gets no home banner notification at all for that order event.

**Impact:** Inconsistent home banner visibility depending on which trigger fires first.

**Risk of fixing:** None — this is a display-layer filter issue.

**Fix:** Add a fallback in `useLatestActionNotification`: if `payload.action` is missing but `reference_path` starts with `/orders/`, treat the notification as actionable with a default "View Order" action.

---

### Implementation Plan

**Single SQL migration** for Bugs 1 and 2:

| Fix | What | Lines |
|-----|------|-------|
| Bug 1 | Update `auto_dismiss_delivery_notifications` to use correct type names | ~5 lines |
| Bug 2 | Store resolved `notification_action` alongside other fields in the primary/fallback lookup | ~10 lines |

**Client-side changes** for Bugs 3 and 5:

| File | Change |
|---|---|
| `src/lib/notification-routes.ts` | Add `settlement` case |
| `src/hooks/queries/useNotifications.ts` | Add fallback action for notifications missing `payload.action` but having `reference_path` |

**Bug 4** requires investigation of the duplicate `order` type trigger source before fixing.

### Files Changed
| File | Change |
|---|---|
| SQL Migration | Fix auto-dismiss types + action lookup fallback |
| `src/lib/notification-routes.ts` | Add `settlement` route case |
| `src/hooks/queries/useNotifications.ts` | Add action fallback in `useLatestActionNotification` |

