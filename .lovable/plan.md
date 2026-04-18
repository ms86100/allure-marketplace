

## Diagnosis

### Issue 0 — Bill Details "not visible"
The `OrderTotalsCard` IS rendered, but on a **cancelled** order it sits **below** a giant `OrderTerminalHero` banner + Items list, so on first paint it's off-screen. There is no real bug in the data flow — it just got pushed down by the new red Cancelled hero. We will move Bill Details directly under the hero/status block so it is one of the first things visible.

### Issue 1 — Buyer's "Hello" message disappears until reopen (P0)
Confirmed: the message `"Hello"` IS in `chat_messages` (verified in DB). Cause:
- `OrderChat` does NOT optimistically append the sent message to local state. It clears the input and waits for the realtime echo via `postgres_changes` INSERT.
- Realtime subscription is created in the same `useEffect` that calls `fetchMessages()`. There's a race: `.subscribe()` returns immediately but the channel isn't actually joined for ~200–800ms. Any INSERT that lands in that window is dropped.
- On top of that, `chat_messages` `REPLICA IDENTITY` is `default` — INSERTs work for realtime but not robust for UPDATEs (read-receipts won't sync live either).

### Issue 2 — Seller has no inbox / live visibility of incoming chats (P0)
Confirmed: there is **no Seller Inbox page**. The seller only sees a chat if they happen to open the specific order. There is no list of "conversations with unread messages", no realtime alert when a new chat message arrives on a different page, no bell-sound for chat (only for new orders).

### Issue 3 — `seller_conversation_messages` table is **NOT** in the realtime publication
Verified via `pg_publication_tables`. The new `useSellerChat` hook subscribes to it, but no events are ever delivered. Buyer-product enquiry chats that flow through it are silently broken.

---

## Plan

### Fix A — `OrderChat.tsx`: instant-render + reliable realtime
1. **Optimistic insert**: when `sendMessage` succeeds, push a temp message into local state immediately with a `pending` flag. When the realtime echo arrives (or `fetchMessages` reconciles), de-dup by `id`.
2. **De-dup guard**: in the realtime handler, ignore the INSERT if a message with that `id` is already in state.
3. **Race-proof subscribe**: subscribe FIRST, then on `SUBSCRIBED` status callback call `fetchMessages()`. This guarantees no INSERT is missed between fetch and subscribe.
4. **Fallback poll**: if no realtime event for >5s after sending, refetch once.
5. Also subscribe to UPDATE for read-receipt sync.

### Fix B — Migration: realtime hardening
```sql
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.seller_conversation_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_conversation_messages;
-- chat_messages already in publication; no-op safe
```

### Fix C — Seller-wide realtime alert + bell + push for new chats
New hook `useSellerChatAlerts` (route-level on seller dashboard / app shell when role=seller):
- Subscribes to `chat_messages` filtered by `receiver_id=eq.<sellerUserId>` and to `seller_conversation_messages` for conversations the seller is in.
- On INSERT → plays notification sound (reuse `notificationSound.ts` used by `useNewOrderAlert`), shows a toast with sender name + preview + "Reply" CTA that deep-links to `/orders/{order_id}` and auto-opens the chat sheet.
- Increments a global unread-chat badge.
- Push notification is already enqueued by sender via `notification_queue`; we'll keep that path and additionally fire `process-notification-queue` invoke right after the insert so the seller's device wakes immediately even if the seller's app is backgrounded.

### Fix D — Seller "Messages" tab (Inbox)
New page `src/pages/SellerMessagesPage.tsx` (route `/seller/messages`, plus a tab/icon in seller dashboard nav with unread badge):
- Lists every order/conversation where the seller is `receiver_id`, sorted by latest message, showing buyer name, last message preview, time-ago, unread count dot.
- Tapping a row opens `OrderChat` (or seller-conversation chat for product enquiries).
- Powered by a single lightweight RPC that aggregates last message per order — avoids N+1.

### Fix E — Auto-open chat from notification deep-link
- `OrderDetailPage` already accepts a query param flow. We'll honor `?chat=1` to auto-open `OrderChat` so the bell/toast/push deep-links land directly inside the conversation.

### Fix F — Bill Details visibility on cancelled orders
- In `OrderDetailPage`, render the `OrderTotalsCard` immediately after `OrderTerminalHero` / `ExperienceHeader` (currently it renders after Items + Seller Info). Result: the bill is one swipe under the hero.

### Fix G — Buyer side gets the same instant-render fix
The optimistic-insert / subscribe-then-fetch pattern from Fix A also fixes the buyer's missing "Hello" since the same `OrderChat` component is used both sides.

---

## Files

**New**
- `src/hooks/useSellerChatAlerts.ts` — global seller chat realtime listener + bell + toast.
- `src/pages/SellerMessagesPage.tsx` — seller inbox.
- `src/components/seller/SellerMessagesTabIcon.tsx` — nav icon with unread badge.
- DB migration: REPLICA IDENTITY + add `seller_conversation_messages` to `supabase_realtime`.

**Edited**
- `src/components/chat/OrderChat.tsx` — optimistic insert, subscribe-before-fetch, de-dup, UPDATE listener, fallback poll.
- `src/hooks/useSellerChat.ts` — same pattern (optimistic + de-dup + subscribe-first).
- `src/pages/OrderDetailPage.tsx` — move Bill Details above Items; honor `?chat=1` auto-open.
- `src/App.tsx` (or wherever `useSellerRealtimeShell` lives) — mount `useSellerChatAlerts` on seller routes.
- Seller dashboard nav — add Messages tab with unread badge.
- `src/components/notifications/RichNotificationCard.tsx` — already humanizes; ensure `chat` notifications deep-link to `/orders/{id}?chat=1`.

## Out of scope
- No changes to RLS policies (existing chat RLS already restricts to sender/receiver).
- No new external push provider — using existing `notification_queue` + `process-notification-queue` edge function.
- No redesign of the chat bubble UI in this pass — purely correctness + visibility + seller surface.

