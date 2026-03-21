

# Round 25: 5 Critical Bugs — Buyer-Side QA Audit

---

## Bug 1: `is_bestseller`, `is_recommended`, `is_urgent` hardcoded to `false` in ALL discovery hooks — badges, popular row, and social proof are broken

**Where:** `useProductsByCategory.ts` line 77-79, `usePopularProducts.ts` line 47-49, `useCategoryProducts` line 134-136, `useNearbyProducts.ts` line 51-53 — all four product-fetching hooks hardcode `is_bestseller: false`, `is_recommended: false`, `is_urgent: false` when mapping RPC results to `ProductWithSeller`.

**What happens:** The `search_sellers_by_location` RPC does NOT return `is_bestseller`, `is_recommended`, or `is_urgent` in `matching_products`. The hooks then hardcode all three to `false`. Consequences:
- The "Popular Near You" discovery row uses `is_bestseller` to pick the hero card (`heroIdx` in MarketplaceSection line 251). Since all are `false`, the hero logic falls through to `completed_order_count` (also not returned by RPC — always 0). No hero card is ever promoted.
- Badge configs for `bestseller` tag (ProductListingCard line 92) never fire — the "Bestseller" badge is invisible to buyers even for products the seller explicitly marked as bestseller.
- The `is_recommended` flag is never surfaced — recommendation-based filtering or sorting is dead.

The separate DB query on the `products` table (network request visible: `GET /rest/v1/products?select=...&id=in.(...)`) DOES return real `is_bestseller` values. But this data is used by a different code path (likely the cart/detail sheet) and is never merged back into the discovery product list.

**Why critical:** Buyers see a flat marketplace with no bestseller badges, no recommended highlights, no urgency signals. The seller's effort to mark products as bestseller is invisible. Social proof ("X families ordered this week") is working independently, but the primary trust signals — Bestseller badge, hero card promotion — are completely suppressed. This directly impacts conversion.

**Impact analysis if fixed:** `ProductListingCard` badges start appearing → `badgeConfigs` rendering changes. Hero card selection in DiscoveryRow changes. Sort by "popular" in CategoryGroupPage uses `is_bestseller` (line 156) — currently always false, so popular sort does nothing.

**Fix risk:** The RPC `search_sellers_by_location` returns products as JSON. Adding `is_bestseller`, `is_recommended`, `is_urgent` to the RPC's JSON build would be the correct fix but requires a DB migration. Client-side alternative: after RPC returns product IDs, batch-fetch the real flags from `products` table and merge.

**Fix:** Add a secondary query in each hook: after collecting all product IDs from the RPC, fetch `id, is_bestseller, is_recommended, is_urgent` from `products` table, then merge into the mapped products. This avoids modifying the RPC.

---

## Bug 2: `feedbackAddItem` gives haptic only — no visual confirmation when buyer taps ADD on a product card

**Where:** `feedbackEngine.ts` line 28-31 — `feedbackAddItem` calls `hapticImpact('medium')` and dispatches a `cart-item-added` CustomEvent. No toast, no micro-copy flash, no visual confirmation. The memory note says "1.5s 'Added checkmark' micro-copy flash on the floating cart pill" but examining `feedbackAddItem`, there is NO toast call.

**What happens:** Buyer taps ADD on a product card. A haptic pulse fires (native only — invisible on web preview). No toast appears. No "Added ✓" text. The only visual change is the stepper (1/+/-) replacing the ADD button IF the product is `add_to_cart` type. For `contact_seller`, `request_quote`, or `book` action types, the card opens the detail sheet — but there's no feedback that the tap registered at all during the transition delay.

For web/preview users (no haptics), the ADD button click has ZERO feedback. The buyer doesn't know if the item was added. They may tap repeatedly, adding multiple units.

**Why critical:** The product component standard mandates "ADD actions trigger an instant haptic pulse, a success toast, and a 1.5s 'Added ✓' micro-copy flash." Two of three feedback channels are missing. On web, all three are missing. This violates the "UI never lies" contract.

**Impact analysis if fixed:** Adding a toast to `feedbackAddItem` will show toasts for every add-to-cart action. This interacts with `feedbackRemoveItem` which does show a toast. The `cart-item-added` event is consumed by the floating cart pill — need to verify if the pill already shows a flash. If not, the toast is the sole visual feedback.

**Fix risk:** Adding a toast.success to `feedbackAddItem` could create toast spam when a buyer rapidly adds multiple items. Use `{ id: 'cart-add' }` to deduplicate.

**Fix:** In `feedbackAddItem`, add: `toast.success(\`\${truncate(productName)} added\`, { id: 'cart-add', duration: 1500 })`. This provides web-visible feedback while deduplicating rapid adds.

---

## Bug 3: Notification inbox tap on delivery-type notifications navigates to `/notifications` (dead end) — `resolveNotificationRoute` has no delivery cases

**Where:** `notification-routes.ts` — the `switch` statement handles `order_*`, `seller_*`, `product_*`, `booking_reminder_*` types. But delivery notification types (`delivery_en_route`, `delivery_proximity`, `delivery_proximity_imminent`, `delivery_stalled`, `delivery_delayed`) are NOT handled — they fall through to `default: return '/notifications'`.

In `NotificationInboxPage.tsx` line 21: `const path = n.reference_path || resolveNotificationRoute(n.type, (n as any).payload)`. If the delivery notification has a `reference_path` (set by the DB trigger), it navigates correctly. BUT if `reference_path` is null (possible for older notifications or if the trigger didn't set it), the fallback route is `/notifications` — the buyer is already on the notifications page, so the tap does nothing.

Additionally, `RichNotificationCard.tsx` line 53: `const referencePath = notification.reference_path || (notification.payload?.reference_path as string)`. If both are null, the action button navigates nowhere (`referencePath` is falsy, so `handleAction` only calls `onDismiss`). The buyer taps "Track Order" on a delivery notification and it just dismisses the card.

**Why critical:** Delivery notifications are the highest-urgency buyer notifications. A buyer seeing "Your order is on the way!" taps the notification expecting to see the order tracking page. Instead, nothing happens (inbox) or the card dismisses (home banner). This is a trust-breaking dead end.

**Impact analysis if fixed:** Adding delivery types to `resolveNotificationRoute` requires knowing the `order_id` from the payload. All delivery notifications should have `order_id` in their payload (set by `fn_enqueue_order_status_notification`). The `useLatestActionNotification` auto-cleanup logic already handles these types correctly (marks as read when order is terminal), so the routing fix is safe.

**Fix risk:** None — purely additive cases in the switch statement.

**Fix:** Add cases for all delivery types in `resolveNotificationRoute`:
```
case 'delivery_en_route':
case 'delivery_proximity':
case 'delivery_proximity_imminent':
case 'delivery_stalled':
case 'delivery_delayed': {
  const orderId = payload?.order_id || payload?.entity_id;
  return orderId ? `/orders/${orderId}` : '/orders';
}
```

---

## Bug 4: `socialProofMap` query key uses only first 5 product IDs — cache returns stale data when product list changes

**Where:** `useSocialProof.ts` line 19 — `queryKey: ['social-proof', lat, lng, productIds.slice(0, 5).join(',')]`. The query key only includes the first 5 product IDs for cache keying, but the actual RPC call sends ALL product IDs. If the product list changes (e.g., a new seller appears, reordering) but the first 5 IDs remain the same, React Query returns cached data — potentially missing social proof counts for new products.

**What happens:** Homepage loads with products [A, B, C, D, E, F, G...]. Social proof fetched for all. Cache key = `['social-proof', lat, lng, 'A,B,C,D,E']`. A new seller appears; products are now [A, B, C, D, E, H, I, J...]. The cache key is identical (first 5 unchanged). React Query returns stale social proof data — products H, I, J show no social proof badges even if they have orders.

**Why critical:** Social proof ("3 families ordered this week") is a key conversion driver. Missing badges on new products means they look less popular than they are, directly impacting discoverability and sales for new sellers.

**Impact analysis if fixed:** Changing the query key to include all product IDs (or a hash of them) will cause more frequent refetches. The RPC `get_society_order_stats` runs on every key change. For performance: the RPC already receives all IDs, and the staleTime is 5 minutes — the impact is acceptable.

**Fix risk:** Increased refetch frequency. Mitigate by using a hash of the full ID list rather than the list itself.

**Fix:** Change query key to: `queryKey: ['social-proof', lat, lng, productIds.length, productIds.slice().sort().join(',')]` — or better, use a stable hash: `queryKey: ['social-proof', lat, lng, JSON.stringify(productIds.sort())]`.

---

## Bug 5: `HomeNotificationBanner` dismissed state resets on every notification refetch — banner flickers back after 30s

**Where:** `HomeNotificationBanner.tsx` lines 14-18 — the `useEffect` resets `dismissed` to `null` whenever `notification?.id` changes. But `useLatestActionNotification` has `refetchInterval: 30_000`. Every 30 seconds, the query refetches. If the notification is still the latest unread (because `markRead.mutate` hasn't propagated yet or failed silently), `notification.id` equals the `dismissed` ID. The `useEffect` condition is `notification.id !== dismissed` — if they're EQUAL, it doesn't reset. This seems correct.

However, the real issue is a race condition: `handleDismiss` calls `markRead.mutate(notification.id)` which is async. The mutation triggers `invalidateQueries(['latest-action-notification'])`. The invalidation re-fetches the query. If the DB update hasn't committed yet (network latency), the refetch returns the SAME notification still marked `is_read: false`. The `useLatestActionNotification` filter at line 89 requires `is_read: false` — so the same notification comes back. The `useEffect` sees `notification.id !== dismissed` is `false` (same ID), doesn't reset. So far OK.

BUT: if the mutation succeeds and the refetch happens AFTER the DB update, `useLatestActionNotification` returns the NEXT unread notification. `dismissed` is set to the OLD notification ID. `notification.id` is now the NEW notification ID. `notification.id !== dismissed` is `true` → `setDismissed(null)`. The banner shows the new notification immediately. This is correct behavior.

The ACTUAL bug: `markRead.mutate` on dismiss doesn't await. If it fails (network error), the notification stays unread. The `dismissed` state is local (component state). If the user navigates away and back, `dismissed` resets to `null`. The same notification reappears. There's no persistent dismissal.

More critically: the `useEffect` dependency array is `[notification?.id]` but it also references `dismissed` in the condition. This is a missing dependency — `dismissed` should be in the deps. Without it, the effect uses a stale `dismissed` closure. If `dismissed` is set to "abc" and a new notification "xyz" arrives, the effect runs (notification.id changed). But it reads stale `dismissed = null` (from the closure before the setState), and sets `dismissed` to `null` — which it already is. This is functionally harmless but indicates the effect logic is fragile.

The real production bug: `onDismiss` on `RichNotificationCard` is only called if the notification has an `action` in its payload (HomeNotificationBanner renders `RichNotificationCard` which shows dismiss button only when `action` exists — line 97-104 in RichNotificationCard). If the latest unread notification has a payload but no `action` key, the `useLatestActionNotification` filter at line 143 (`if (!n?.payload?.action) continue`) SKIPS it. So only action notifications appear. But `RichNotificationCard` renders actions conditionally — what if `action` is an empty string? `!""` is `true` — the filter skips it. But `String(action)` in the button renders an empty button label. This is a minor UI glitch.

Let me refocus on a more impactful Bug 5.

**Bug 5 (revised): Category tile shows item count badge but clicking navigates to a page that may show zero products — misleading "12 items" badge**

**Where:** `CategoryImageGrid.tsx` line 138-141 — shows `{meta.count} items` overlay badge on category tiles. `meta.count` comes from `productCategories` (the `useProductsByCategory` hook output). This counts ALL products returned by `search_sellers_by_location` for that category. But `CategoryGroupPage` uses `useCategoryProducts` which calls `search_sellers_by_location` AGAIN independently. If the two RPC calls return different results (timing, new sellers, cache differences), the count shown on the homepage tile won't match the count on the category page.

More critically: `useCategoryProducts` fetches ALL categories' sellers (line 107-112 doesn't filter by category in the RPC call), then filters client-side by `categorySet`. The RPC returns up to some limit of sellers. If a popular category's sellers are at the end of the result set and get truncated, the category page shows fewer products than the homepage tile promised.

Additionally, the homepage `useProductsByCategory` uses `_exclude_society_id` parameter (line 50) while `useCategoryProducts` also uses it (line 111) — but cache keys differ, so results may diverge.

**What happens:** Buyer sees "Salon · 6 items" on the category tile. Taps it. The category page loads and shows 4 items (the other 2 sellers' products were in a different RPC page or excluded differently). The buyer expected 6, sees 4 — confusion.

**Why critical:** The count badge is a promise. Breaking that promise erodes trust. "12 items" → tap → empty or fewer items is the classic "banner leads to nothing" anti-pattern.

**Impact analysis if fixed:** Removing the count badge removes a useful signal. Better: ensure the count is consistent by using the same query/cache.

**Fix risk:** Changing the count source could show 0 for some categories (hiding the badge). This is actually better — showing no badge is less harmful than showing a wrong count.

**Fix:** Either (a) remove the count badge entirely (safest), or (b) make `CategoryGroupPage` share the same query key/cache as `useProductsByCategory` so counts are always consistent.

---

## Summary

| # | Bug | Severity | Files |
|---|-----|----------|-------|
| 1 | Bestseller/recommended/urgent hardcoded `false` in all discovery hooks | **CRITICAL** | `useProductsByCategory.ts`, `usePopularProducts.ts`, `useNearbyProducts.ts` |
| 2 | `feedbackAddItem` has no visual confirmation — zero feedback on web | **HIGH** | `feedbackEngine.ts` |
| 3 | Delivery notification taps lead nowhere — missing route cases | **HIGH** | `notification-routes.ts` |
| 4 | Social proof query key ignores products beyond first 5 — stale badges | **MEDIUM** | `useSocialProof.ts` |
| 5 | Category tile count badge doesn't match actual category page results | **MEDIUM** | `CategoryImageGrid.tsx`, `useProductsByCategory.ts` |

## Files to Edit

- `src/hooks/queries/useProductsByCategory.ts` — Bug 1: fetch real flags from `products` table after RPC, merge
- `src/hooks/queries/usePopularProducts.ts` — Bug 1: same merge pattern
- `src/hooks/queries/useNearbyProducts.ts` — Bug 1: same merge pattern
- `src/lib/feedbackEngine.ts` — Bug 2: add toast.success to `feedbackAddItem`
- `src/lib/notification-routes.ts` — Bug 3: add delivery notification cases
- `src/hooks/queries/useSocialProof.ts` — Bug 4: fix query key to include all product IDs
- `src/components/home/CategoryImageGrid.tsx` — Bug 5: remove misleading count badge or source from shared cache

