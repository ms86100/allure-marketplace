

# 5 Critical Buyer-Facing Bugs — Round 3 (Revised with Clear Actor Impact)

## Bug 1: Chat messages don't trigger push notifications — seller never knows buyer messaged

**Where in the flow:** Buyer opens an active order → taps Chat → types "I'm running 10 minutes late, please hold my order" → sends.

**What happens:** The message inserts into `chat_messages` successfully (line 109, `OrderChat.tsx`). The seller sees it ONLY if they happen to have the same chat open at that exact moment (via realtime subscription). There is **no trigger** on `chat_messages` (confirmed: zero DB triggers on that table) and **no call** to `process-notification-queue` after sending. Every other buyer action — placing orders, confirming payment, confirming delivery — triggers this function. Chat is the only action that doesn't.

**Who is confused and why:**
- **Buyer** thinks: "I told the seller I'm late, they'll see it." They did the right thing — communicated proactively. They trust the system carried their message.
- **Seller** thinks: "The buyer went silent, they're probably not coming." They may cancel the order or prepare for a no-show.
- **Result:** The buyer arrives and says "I told you I'd be late!" — the seller never saw it. Trust in the chat system is destroyed for both parties.

**Fix:** Add `supabase.functions.invoke('process-notification-queue').catch(() => {})` after the successful insert at line 116 in `OrderChat.tsx`. This is the same pattern used in every other action in the system.

---

## Bug 2: Notification inbox never auto-refreshes — buyer sees stale list despite badge showing new count

**Where in the flow:** Buyer is on any page → notification badge shows "3" (updated every 30s via `useUnreadNotificationCount` with `refetchInterval: 30_000`) → buyer taps the bell → opens notification inbox.

**What happens:** The inbox uses `useNotifications` (line 22, `useNotifications.ts`) which has `staleTime: 0` but **no `refetchInterval`**. It fetches once on mount and never again. If the buyer stays on the inbox page and a new notification arrives, the badge count increments (it polls) but the inbox list stays frozen.

**Who is confused and why:**
- **Buyer** sees the badge go from "3" to "4" while staring at the inbox. The list shows 3 items. Where's the 4th? They think: "Is the badge wrong? Is the notification lost?" They must navigate away and come back to see the new notification.
- This is a trust-eroding mismatch: two parts of the same feature (badge vs. list) disagree on the state of notifications.

**Fix:** Add `refetchInterval: 30_000` to `useNotifications` to match the badge polling interval. Both views stay in sync.

---

## Bug 3: Recently Viewed shows delisted products — buyer can add rejected items to cart

**Where in the flow:** Buyer viewed a product 2 days ago → admin rejects it (sets `approval_status: 'rejected'` but `is_available` may still be `true`) → buyer opens home page → "Recently Viewed" section shows the product with an Add button.

**What happens:** The query at line 19-23 of `RecentlyViewedRow.tsx` only filters by `is_available = true`. It does NOT check `approval_status`. A product can be `is_available: true` AND `approval_status: 'rejected'` — this is a valid DB state (the seller left it available, admin rejected it). The checkout flow DOES catch this (line 292, `useCartPage.ts` checks `approval_status !== 'approved'`) — but by then the buyer has already added it, seen it in cart, and gets a confusing error at checkout: "Some items are no longer available."

**Who is confused and why:**
- **Buyer** sees a product they viewed before. It looks normal. They tap "+". It goes into the cart. They proceed to checkout. At the last moment: "Some items are no longer available." They think: "But I just added it! The app showed it to me!" The system actively offered something it would then reject. This feels like a bait-and-switch.

**Fix:** Add `.eq('approval_status', 'approved')` to the query at line 23 of `RecentlyViewedRow.tsx`. Products that aren't approved never appear in Recently Viewed. The buyer never sees something the system won't let them buy.

---

## Bug 4: Order list doesn't refresh after status changes — buyer gets haptic buzz but sees stale data

**Where in the flow:** Buyer is on the Orders page → seller accepts their order → `useBuyerOrderAlerts` detects the change, plays haptic feedback, invalidates `queryKey: ['orders']`.

**What happens:** The Orders page (`OrdersPage.tsx` line 125) uses `useState<Order[]>` + manual `fetchOrders` — NOT react-query. So when `useBuyerOrderAlerts` invalidates `['orders']`, **nothing happens** to the displayed list. The buyer felt the haptic buzz (or saw a toast) saying "Order accepted!" but the list still shows "Placed" status. They must navigate away and come back (line 176-179 re-fetches on `location.key` change) to see the update.

**Who is confused and why:**
- **Buyer** gets a notification/buzz: "Your order was accepted!" They look at the screen — it still says "Placed." They think: "Was it actually accepted? Is the notification wrong? Is the list wrong?" Two features (alerts + list) are telling different stories simultaneously. This is the same class of mismatch as Bug 2 but worse — it's about order status, which is the core trust signal.

**Fix:** Add a `visibilitychange` listener to `OrderList` that calls `fetchOrders()` when the page becomes visible. Also listen for the custom `order-detail-refetch` event (already used in `useOrderDetail.ts`). This way, when the buyer returns to the orders tab or receives an alert, the list refreshes.

---

## Bug 5: Chat recipient resolves to self when buyer is also a seller on the platform

**Where in the flow:** User A has a seller profile (store). User A also buys from User B's store. User A opens their order from User B → taps Chat.

**What happens:** `chatRecipientId` at line 221 of `useOrderDetail.ts` is: `isSellerView ? order.buyer_id : seller?.user_id`. The `isSellerView` check (line 30-41) matches `order.seller_id` against `sellerProfiles.some(sp => sp.id === orderSellerId)`. Since User A has seller profiles, if ANY of their profiles' IDs happen to match `order.seller_id` (which is User B's seller profile — should never match), this is safe. **However**, the `currentSellerId` check at line 35 is the real risk: if User A was last viewing their seller dashboard and `currentSellerId` is set to their own seller profile ID, AND then navigates to view an order THEY PLACED as a buyer, `currentSellerId` doesn't reset. If there's any data inconsistency where `order.seller_id === currentSellerId`, `isSellerView` becomes `true`, and `chatRecipientId` becomes `order.buyer_id` — which is User A themselves.

**Who is confused and why:**
- **Buyer (who is also a seller)** opens their purchase order, taps chat, sends "When will my order be ready?" — the message goes to themselves. They see their own message appear as both sent and received. No error, no warning. The actual seller (User B) never gets the message. The buyer thinks they communicated; the seller has no idea.

**Fix:** Add a guard after line 221: `if (chatRecipientId === user?.id) chatRecipientId = isSellerView ? seller?.user_id : order?.buyer_id` — flip to the other party. If both resolve to self (impossible in normal flow, but defensive), set `canChat = false`.

---

## Summary

| # | Bug | Actor confused | What they see vs. what's true |
|---|-----|---------------|-------------------------------|
| 1 | Chat has no push notification | **Buyer** thinks seller saw it; **Seller** never notified | Message sent ≠ message delivered |
| 2 | Inbox doesn't auto-refresh | **Buyer** sees badge "4" but list shows 3 | Badge and list disagree |
| 3 | Recently Viewed shows rejected products | **Buyer** adds item, checkout rejects it | App offers then refuses |
| 4 | Order list stale after status change | **Buyer** gets "accepted" buzz, list says "placed" | Alert and list disagree |
| 5 | Chat goes to self for dual-role users | **Buyer-seller** chats with themselves | Sent message goes nowhere |

All fixes are surgical — same patterns already used elsewhere in the codebase.

