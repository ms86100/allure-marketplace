

## Three fixes

### Fix 1 — Quantity badge visibility (`OrderItemCard.tsx`)
The current `×1` badge is 20px wide with 10px text using `bg-foreground text-background` — too small and low contrast against the placeholder/thumbnail. Make it a proper, always-readable pill:

- Move badge from "floating on thumbnail corner" to an **inline pill** next to the product name: `Qty 1` in a soft chip (`bg-primary/10 text-primary`, 11px font, rounded-full px-2 py-0.5). This avoids any clipping and is identical for buyer & seller.
- Keep a smaller `×1` corner mark only when quantity > 1, with stronger styling: `bg-primary text-primary-foreground`, 22px min-width, 11px bold, ring-2 ring-background so it pops on any thumbnail.

Both buyer view and seller view use the same component, so one change covers both.

### Fix 2 — Stop the chat bell once seller engages (`useSellerChatAlerts.ts` + `OrderChat.tsx`)
Today: every incoming buyer message re-rings the bell, even while the seller is staring at the chat. There is no signal back to the alerts hook that "this conversation is currently open".

Plan:
1. Introduce a tiny module-level **active-chat registry** (`src/lib/activeChatRegistry.ts`) with `setActiveChat(orderId)` / `clearActiveChat(orderId)` / `isChatActive(orderId)`.
2. `OrderChat.tsx`: on mount/open call `setActiveChat(order_id)`; on close/unmount call `clearActiveChat`. Also call it whenever the seller sends a message (refresh "active" timestamp valid for 60s).
3. `useSellerChatAlerts` INSERT handler: if `isChatActive(msg.order_id)` → skip `playBell`, skip toast (still increment unread silently and let the in-thread render handle it).
4. Also: when the seller **sends** a reply in `OrderChat`, immediately call a new `silenceChatBell()` exported from `useSellerChatAlerts` (via a small zustand or event bus) to cancel any in-flight throttled bell timer for that order.
5. Hard guard: never play more than one bell per 4s per order (raise from 2s global throttle to per-order 4s) so back-to-back buyer messages don't machine-gun the bell.

### Fix 3 — Notification card wording for chat (`RichNotificationCard.tsx` + `useNotifications.ts`)
The card in the screenshot is `RichNotificationCard`. For `type === 'chat'` it currently falls through to the generic `view_order` mapping → "View Order".

Plan:
- In `useNotifications.ts` `latest-action-notification` builder: when `n.type === 'chat'`, set `data.action = 'reply'` (instead of defaulting to `View Order`), and set `reference_path` to `/orders/{orderId}?chat=1` if an `orderId` is in the payload.
- In `RichNotificationCard.formatActionLabel`: add `reply: 'Reply'` and `view_message: 'View Message'`.
- In `getIcon`: add a `case 'chat'` returning `MessageCircle` icon so the card visually says "chat", not the generic bell.
- Keep the secondary "Dismiss" button as-is.

Result: the card reads **"Sagar Buyer: hi → [Reply] [Dismiss]"** and tapping Reply opens the order with the chat sheet auto-open (already supported via `?chat=1`).

## Files

**New**
- `src/lib/activeChatRegistry.ts` — tiny in-memory registry + event emitter to silence bell while a chat is open.

**Edited**
- `src/components/order/OrderItemCard.tsx` — clearer inline `Qty` pill + stronger corner badge.
- `src/hooks/useSellerChatAlerts.ts` — consult `activeChatRegistry`, accept silence signal, per-order 4s throttle.
- `src/components/chat/OrderChat.tsx` — register active chat on open, clear on close, silence bell on send.
- `src/components/notifications/RichNotificationCard.tsx` — chat icon + Reply/View Message labels.
- `src/hooks/queries/useNotifications.ts` — chat-type notifications get `action='reply'` + `?chat=1` deep link.

## Out of scope
- No DB changes.
- No redesign of chat bubble UI.
- No change to `useUrgentOrderSound` (separate urgent-order audio loop, unrelated).

