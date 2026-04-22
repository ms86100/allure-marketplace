

## Fix: Notification taps route to wrong page (settings) and other dead routes

### Root cause (verified against the DB)

Click handling for notifications (in `NotificationInboxPage` and `RichNotificationCard`) does:

```ts
const path = n.reference_path || resolveNotificationRoute(n.type, n.payload);
```

Two problems make taps land on the wrong page:

1. **`review_prompt` (the "⭐ How was your order?" notification) has `reference_path = NULL`** and `resolveNotificationRoute` has **no case for `review_prompt`** — so it hits the `default` branch and returns `/notifications`, which in this app is the **notification *settings* page**, not the inbox. That's exactly the bug shown.
2. Other notification types in the DB also point to **dead or wrong routes**:
   - `review_received` → `/seller/dashboard` (no such route — real one is `/seller`)
   - `review` → `/seller/reviews` (no such route)
   - `support_ticket` rows have `reference_path = /support/<id>` (no such route)
   - resolver also references `/seller/settlements` (no such route)
   - resolver lacks cases for `delivery`, `chat_message`, `parcel`, `order_lifecycle`, `seller_daily_summary`, `review`, `review_received`, `review_prompt` — they only work today because some happen to have a valid `reference_path`.

### Verified data (from `user_notifications`)

| type | rows | reference_path | route taken today |
|---|---|---|---|
| review_prompt | 6 | NULL | `/notifications` (settings) ❌ |
| review_received | 1 | /seller/dashboard | dead route ❌ |
| review | 1 | /seller/reviews | dead route ❌ |
| support_ticket | 1 | /support/<id> | dead route ❌ |
| order_status | 85 | NULL | `/orders/<id>` ✓ (resolver handles it) |
| order | 28 | /orders/<id> | ✓ |
| order_lifecycle | 6 | /orders/<id> | ✓ (via reference_path only) |
| delivery | 5 | /orders/<id> | ✓ (via reference_path only) |
| moderation | 8 | /admin | ✓ |

### The fix — make routing data-driven and verified-correct

**1. `src/lib/notification-routes.ts` — add the missing cases and correct the dead ones.**

Add cases for:
- `review_prompt`, `review`, `review_received` → `/orders/<order_id>` (where the user actually rates / sees the review)
- `delivery`, `chat_message`, `order_lifecycle` → `/orders/<order_id>` from payload (`order_id` / `orderId` / `entity_id`)
- `parcel` → `/parcels`
- `seller_daily_summary` → `/seller`

Correct existing dead targets:
- `support_ticket` mapping currently points at non-existent `/support/...`; rewrite to `/orders/<order_id>` (already in payload) and ignore an invalid `reference_path` if it starts with `/support/`.
- `settlement` → change `/seller/settlements` to `/seller/earnings` (real route).
- `seller_approved` / `_suspended` already → `/seller` ✓.

Change the `default` fallback from `/notifications` (settings) to **`/notifications/inbox`** (the inbox the user just came from) so a missing case never silently dumps the user into settings.

**2. Guard the `reference_path || resolver(...)` call in both consumers**

In `NotificationInboxPage.handleTap` and `RichNotificationCard.handleAction`, replace the simple `||` with a small helper:

```ts
function pickRoute(n) {
  const ref = n.reference_path?.trim();
  // Reject known-dead reference_paths so they fall back to the resolver
  const DEAD = [/^\/support(\/|$)/, /^\/seller\/dashboard$/, /^\/seller\/reviews$/, /^\/seller\/settlements$/];
  if (ref && ref.startsWith('/') && !DEAD.some(re => re.test(ref))) return ref;
  return resolveNotificationRoute(n.type, n.payload);
}
```

This protects against historic rows in the DB that already have a bad `reference_path` written to them (we won't backfill — the guard handles them transparently).

**3. (Optional but cheap) Backfill the existing 6 `review_prompt` rows**

A one-shot SQL `UPDATE user_notifications SET reference_path = '/orders/' || (payload->>'order_id') WHERE type = 'review_prompt' AND reference_path IS NULL;` so the legacy rows route correctly even on devices that don't have the new client yet. Same for the handful of `review`/`review_received`/`support_ticket` rows pointing at dead routes.

### Files touched

- `src/lib/notification-routes.ts` — add missing cases, correct dead targets, change default fallback.
- `src/pages/NotificationInboxPage.tsx` — use `pickRoute` helper instead of `||`.
- `src/components/notifications/RichNotificationCard.tsx` — same helper.
- One small SQL migration to backfill the ~10 existing rows with bad/missing `reference_path`.

### Verification

1. Tap a "⭐ How was your order?" notification → opens `/orders/<id>` (where rating UI lives), NOT the settings page.
2. Tap a `review_received` notification (seller) → lands on `/seller`, not the dead `/seller/dashboard`.
3. Tap a `support_ticket` notification → opens the related order page, not a 404.
4. Any *future* unknown notification type → lands on `/notifications/inbox`, never on settings.
5. Existing working types (`order`, `order_status`, `delivery_*`, `parcel`, `moderation`) continue to route exactly as before.
6. Manual smoke: load inbox, tap each notification kind currently in the DB, confirm correct page each time.

### Out of scope

- Redesigning notification creation pipeline — fixing payload/`reference_path` at write time is a separate cleanup; the resolver + dead-route guard make this resilient regardless.
- Push-notification (OS-level) tap routing — that path uses the same resolver and benefits automatically.
- Notification settings page UX changes.

