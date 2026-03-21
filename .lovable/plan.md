

# Deep UX Audit — Round 2: Remaining Invisible Gaps

After the previous 19 improvements, this audit focuses on gaps that still remain. Every item below closes a connection between existing features — no new features.

---

## Phase 1: Seller Detail Page — The Trust Decision Point

This is the most critical page for conversion. Buyers decide here whether to order.

### 1. No "store currently closed" banner at the top of SellerDetailPage
**File**: `src/pages/SellerDetailPage.tsx` (~line 318, inside seller info card)
**Problem**: If a seller has `is_available === false`, the buyer can still browse the full page and even try to add items — only to be blocked at the ProductCard or ProductDetailSheet level with small "Closed" labels. There's no prominent banner at the top saying "This store is currently closed."
**Fix**: After the seller info card (line ~320), check `seller.is_available === false` and render a prominent amber banner: "This store is currently closed. Browse the menu and order when they reopen." This matches how the ProductCard already handles it but at page level.

### 2. No "when does this seller reopen?" info
**File**: `src/pages/SellerDetailPage.tsx` (~line 392-400)
**Problem**: Operating hours are shown as start-end times, and operating days are shown as badges — but if you visit a closed seller, there's no "Opens tomorrow at 9:00 AM" or "Opens Mon at 10:00 AM" message. The `store-availability.ts` lib already computes `nextOpenAt` — it's just not used here.
**Fix**: When `seller.is_available === false` or outside hours, use `computeStoreStatus()` and show the `formatStoreClosedMessage()` result in the banner from #1.

### 3. SellerDetailPage — no products state is confusing
**File**: `src/pages/SellerDetailPage.tsx` (line 580-584)
**Problem**: When a seller has no available products, the empty state just says "No products available" — but the seller might be in the process of adding products, or all products might be temporarily unavailable. The message doesn't distinguish.
**Fix**: Change to: "No items listed yet. Check back later or browse other sellers in your community." with a link to `/search`.

---

## Phase 2: Order Flow Anxiety Points

### 4. No estimated delivery/pickup time shown BEFORE placing order
**File**: `src/pages/CartPage.tsx` (line 83-88)
**Problem**: The prep time banner ("Ready in ~X minutes") only shows for self_pickup context. For delivery orders, buyers have zero time expectations before committing. The `estimated_delivery_at` field only exists after order creation.
**Fix**: For delivery orders, show: "Estimated delivery: ~{prepTime + deliveryEstimate} minutes" using prep time + a configurable delivery buffer. Even an approximate range reduces anxiety.

### 5. Multi-seller cart — no visual separation of "what happens"
**File**: `src/pages/CartPage.tsx` (line 234)
**Problem**: The single line "Your cart has items from X sellers. Separate orders will be created for each." is easy to miss. Users don't realize they'll get separate order confirmations, separate payments, and separate tracking.
**Fix**: Make this more prominent — move it above the seller groups (not below), wrap in a card with an info icon, and add: "Each seller will receive and fulfill their order independently."

### 6. No seller phone/contact visible on CartPage or during checkout
**File**: `src/pages/CartPage.tsx`
**Problem**: If a buyer wants to clarify something with the seller before ordering (e.g., "Do you have X in stock?"), there's no way to contact them from the cart page. They'd have to go back to the seller page.
**Fix**: Add a small "Message seller" or phone icon next to each seller group header in the cart, linking to the seller detail page or phone.

---

## Phase 3: Search & Discovery Gaps

### 7. Search returns no results — no guidance
**File**: `src/pages/SearchPage.tsx` (need to check empty state)
**Problem**: When search returns zero results, what does the user see? If it's just an empty space or "No results", that's a dead end. The session replay shows the user searching for "Fitness", "Electrician", "Plumber", "Carpenter" — these are service categories that might not have sellers yet.
**Fix**: Show: "No results for '[query]'. Try browsing by category, or become the first to offer this service." with a link to category browse and `/become-seller`.

### 8. TypewriterPlaceholder creates false expectations
**File**: `src/components/search/TypewriterPlaceholder.tsx`
**Problem**: The typewriter cycles through example searches. If it shows "Electrician" but no electricians exist in the community, the user searches, gets nothing, and feels disappointed. The placeholder creates an implicit promise.
**Fix**: Either (a) filter placeholder examples to only show categories that have active sellers, or (b) add a disclaimer in the empty results: "Some services may not be available in your community yet."

---

## Phase 4: Returning User Micro-Gaps

### 9. Order confirmation dialog doesn't show delivery address summary
**File**: `src/pages/CartPage.tsx` (line 294-310)
**Problem**: The confirm dialog shows items count, payment method, and total — but for delivery orders, it shows the address label in a cramped row. If the address is wrong, this is the last chance to catch it. The address should be more prominent.
**Fix**: Give the delivery address its own visual block in the confirm dialog with the full address line (flat, block, building), not just the label.

### 10. Profile page has "Order Again" quick action that goes to /orders — not reorder
**File**: `src/pages/ProfilePage.tsx` (line 99)
**Problem**: The "Order Again" quick action navigates to `/orders` — the same destination as "Orders". It doesn't actually trigger a reorder flow. It's a duplicate link disguised as a different action.
**Fix**: Either (a) remove "Order Again" since it duplicates "Orders", or (b) link it to the last completed order's detail page where the actual ReorderButton lives, or (c) link to `/search` with a "reorder" hint.

### 11. Favorites page shows no rating or category for sellers
**File**: `src/pages/FavoritesPage.tsx` (line 107-157)
**Problem**: The `FavoriteSellerCard` shows only the seller image, name, and owner name. No rating, no category, no operating hours. When a user has 10+ favorites, they can't distinguish between sellers without tapping each one.
**Fix**: Add the seller's rating (star icon + number) and primary category below the name. This is already available in the `seller_profiles` data being fetched.

### 12. No "last ordered" indicator on seller cards in marketplace
**File**: `src/components/home/ShopByStoreDiscovery.tsx` or marketplace seller cards
**Problem**: When browsing the marketplace, returning users see all sellers equally. There's no indicator of "You ordered from here 3 days ago" to reinforce familiarity and habit.
**Fix**: Cross-reference the user's order history and show a small "Ordered recently" badge on seller cards they've ordered from in the last 30 days. This builds habit loops.

---

## Phase 5: Emotional Safety Net

### 13. Report seller confirmation — no reassurance
**File**: `src/pages/SellerDetailPage.tsx` (line 196)
**Problem**: After submitting a seller report, a simple toast says "Report submitted. Our team will review it shortly." — but there's no indication of what happens next, how long it takes, or whether the reporter will be notified.
**Fix**: Change to: "Report submitted. Our moderation team will review within 24 hours. You'll be notified of any action taken. Your identity is kept confidential."

### 14. Delivery code (OTP) card has no explanation of consequences
**File**: `src/pages/OrderDetailPage.tsx` (line 424-431)
**Problem**: The delivery OTP card says "Share this code with the delivery person to confirm delivery" — but doesn't explain what happens if they share it prematurely or if the wrong person asks for it.
**Fix**: Add a subtle warning: "Only share when you've received your items. This code confirms delivery is complete." This prevents social engineering.

### 15. Review form has no context about privacy
**File**: ReviewForm component (used in OrderDetailPage)
**Problem**: When asked to "Rate this order", buyers may hesitate if they think the seller will see who gave a low rating. There's no indication of whether reviews are anonymous or attributed.
**Fix**: Add a small note near the review form: "Your review will be shown with your first name. Sellers cannot see your contact details."

---

## Summary Priority

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1-2 | Closed store banner + reopen time | High | Low |
| 7 | Search empty state guidance | High | Low |
| 5 | Multi-seller cart explanation | Medium | Low |
| 14 | Delivery OTP safety warning | High | Trivial |
| 11 | Favorites — show rating/category | Medium | Low |
| 10 | Remove duplicate "Order Again" | Medium | Trivial |
| 4 | Pre-order delivery time estimate | High | Medium |
| 9 | Confirm dialog address prominence | Medium | Low |
| 13 | Report confirmation reassurance | Medium | Trivial |
| 3 | Seller no-products empty state | Low | Trivial |
| 6 | Cart seller contact shortcut | Medium | Low |
| 8 | TypewriterPlaceholder false promises | Low | Medium |
| 12 | "Ordered recently" badge | Medium | Medium |
| 15 | Review privacy note | Medium | Trivial |

15 improvements across ~10 files. All close gaps between existing features.

