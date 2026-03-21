

# Comprehensive UX Polish: 19 Micro-Improvements

Removing item #1 (society request tracking) per your feedback. All remaining items refined with precise file locations and implementation details.

---

## Phase 1: Critical Trust & Safety (4 items)

### 1. Show cancellation/rejection reason to SELLERS (not just buyers)
**File**: `src/pages/OrderDetailPage.tsx` (line 239)
**Problem**: The `rejection_reason` banner is gated with `o.isBuyerView` — sellers see "Cancelled" with zero explanation. Auto-cancelled orders (timeout) are especially confusing.
**Fix**: Duplicate the banner for seller view with contextual copy: "This order was cancelled. Reason: [reason]". For auto-cancellations, append: "Tip: Respond within 3 minutes to avoid auto-cancellation."

### 2. Restore navigation on terminal order pages
**File**: `src/pages/OrderDetailPage.tsx` (line ~56)
**Problem**: `showNav={false}` hides BottomNav for ALL order states, but the fix was only needed for the action bar overlap. Terminal orders have no action bar, so users are trapped.
**Fix**: Change to `showNav={isTerminalStatus(o.flow, order.status)}` — show nav when order is done, hide only when action bar is active.

### 3. Gate debug pages behind admin check
**File**: `src/pages/ProfilePage.tsx` (lines 115-116)
**Problem**: "Push Debug" and "Live Activity Debug" are visible to every user. These are developer tools that erode perceived professionalism.
**Fix**: Wrap both entries in the existing `isAdmin` conditional, same as "Admin Panel" and "Platform Docs".

### 4. Clean up "Coming Soon" dead-ends
**Files**: `src/pages/BecomeSellerPage.tsx` (lines 126-127), `src/pages/SellerSettingsPage.tsx` (lines 276-277), `src/components/admin/OtpSettings.tsx`, `src/components/admin/AdminServiceBookingsTab.tsx`
**Problem**: Four "coming soon" labels create false expectations and make the platform feel unfinished.
**Fix**: For BecomeSellerPage/SellerSettingsPage — change "coming soon" to "Available in future plans" with a muted style. For admin stubs (OtpSettings, AdminServiceBookingsTab) — add a brief explanation: "This feature is being built. You'll be notified when it's ready."

---

## Phase 2: Emotional Reassurance (5 items)

### 5. No seller response time expectation for buyers
**File**: `src/pages/OrderDetailPage.tsx` (around the "Order Placed Successfully" banner, line 206)
**Problem**: After placing an order, buyers have no idea how long to wait for seller acceptance. The urgent timer only shows on urgent items.
**Fix**: Below the celebration banner, add a subtle "Waiting for [Seller] to confirm..." line. If the seller has `avg_response_minutes` data, show "Usually responds in ~X min". Otherwise show "Sellers typically respond within a few minutes."

### 6. Chat closed state — explain, don't just hide
**File**: `src/pages/OrderDetailPage.tsx` (line 193-198)
**Problem**: The chat button disappears on terminal orders (`o.canChat` becomes false). Users wonder if chat broke.
**Fix**: When `!o.canChat && isTerminalStatus(...)`, show a muted chat icon with tooltip/text: "Chat closed — order complete. Need help? Contact support." linking to `/help`.

### 7. Cancellation policy visibility pre-order
**File**: `src/components/cart/CartPage.tsx` or equivalent checkout area
**Problem**: Users commit to an order without knowing cancellation rules. "Can I cancel? Will I get refunded?" are unspoken anxieties.
**Fix**: Near the payment method selector, add a collapsible info line: "You can cancel for free before the seller accepts. UPI refunds process within 24 hours."

### 8. Seller verification badge — make it tappable with explanation
**File**: `src/pages/SellerDetailPage.tsx` (around ShieldCheck badge, line 445-449)
**Problem**: The "0% cancellation" badge exists but the verified seller concept is not explained anywhere. Users see badges but don't know what they mean.
**Fix**: Wrap the badge in a clickable element that opens a small sheet/tooltip: "This seller is a verified resident of your community, confirmed by society admins. They have completed X orders with 0% cancellation rate."

### 9. BecomeSellerPage — add expected review timeline
**File**: `src/pages/BecomeSellerPage.tsx` (post-submission confirmation)
**Problem**: After submitting seller application, users see "pending review" but no timeline or next steps.
**Fix**: Add confirmation copy: "Your application is under review. Most applications are reviewed within 24-48 hours. You'll receive a notification when approved."

---

## Phase 3: Workflow & Navigation Polish (5 items)

### 10. Favorites page hides closed sellers
**File**: `src/pages/FavoritesPage.tsx` (line 44)
**Problem**: `s.is_available !== false` filter silently removes closed sellers from favorites. Users think they accidentally unfavorited them.
**Fix**: Remove the `is_available` filter. For unavailable sellers, render the card with a semi-transparent overlay and "Currently closed" badge. Keep the unfavorite button functional.

### 11. Buyer order filters
**File**: `src/pages/OrdersPage.tsx` (around line 117, OrderList component)
**Problem**: Buyer orders are a flat chronological list. Users with 20+ orders must scroll endlessly to find active ones.
**Fix**: Add a simple chip filter row above the list: "All | Active | Completed | Cancelled". Filter using the existing `useTerminalStatuses` hook data.

### 12. Cart — "Add more from this seller" shortcut
**File**: Cart component (wherever cart items are grouped by seller)
**Problem**: After adding 1 item, the cart feels like a dead-end. No momentum to continue shopping from the same seller.
**Fix**: Under each seller group in the cart, add a subtle "+ Add more from [Seller Name]" link navigating to that seller's store page.

### 13. Notification inbox — visual differentiation by type
**File**: `src/pages/NotificationInboxPage.tsx` (line 74-79)
**Problem**: All notifications use the same Bell icon regardless of type (order update, community post, system message). Hard to scan.
**Fix**: Map `n.type` to specific icons: order-related → Package, community → Users, delivery → Truck, system → Bell (default). Apply subtle color coding to the icon circle.

### 14. Profile completion nudge — add "why it matters"
**File**: HomePage profile completion banner
**Problem**: The completion bar shows missing fields but doesn't explain *why* completing the profile matters.
**Fix**: Add micro-copy: "Complete your profile so sellers can deliver to the right door and community features work best for you."

---

## Phase 4: Returning User Value (5 items)

### 15. Welcome back context strip
**File**: `src/pages/HomePage.tsx`
**Problem**: Returning users with no active orders see a static marketplace. No acknowledgment of their last activity.
**Fix**: If no active orders, show a single-line strip: "Last order: [Seller] · [date] · [status]" or "[X] sellers near you are open now" to provide immediate context.

### 16. Empty marketplace — actionable CTAs for new societies
**File**: Marketplace empty state component
**Problem**: New societies with no sellers show "Your marketplace is getting ready!" with no actionable next step.
**Fix**: Add contextual CTAs: "Become the first seller" (→ /become-seller), "Invite neighbors" (share society link), "Browse nearby" (toggle browseBeyond if available).

### 17. Payment method clarity on order cards
**File**: `src/pages/OrdersPage.tsx` (OrderCard component, line 22)
**Problem**: Order cards in the list don't show payment method. Users can't quickly distinguish COD vs UPI orders.
**Fix**: Add a tiny payment badge next to the status badge: "COD" or "UPI ✓" in the order card's metadata row.

### 18. Dormant user re-engagement
**File**: `src/pages/HomePage.tsx`
**Problem**: Users who haven't ordered in 2+ weeks get no behavioral nudge.
**Fix**: Show a "What's new" section highlighting new sellers or trending products since their last visit date (stored in profile or localStorage).

### 19. Seller response time visibility on seller detail page
**File**: `src/pages/SellerDetailPage.tsx`
**Problem**: Buyers can't gauge how responsive a seller is before ordering. This creates anxiety: "Will they even see my order?"
**Fix**: If `avg_response_minutes` data exists, show a small badge: "Usually responds in ~X min" near the seller's operating hours. If no data, show nothing (no false promises).

---

## Implementation Priority

| Priority | Items | Effort |
|----------|-------|--------|
| Do first | #1, #2, #3, #10 | Trivial — single-line changes |
| Do next | #4, #5, #6, #11, #13 | Low — small UI additions |
| Then | #7, #8, #9, #12, #14 | Medium — new small components |
| Polish | #15, #16, #17, #18, #19 | Medium — data queries + UI |

Total: 19 targeted improvements across ~12 files. No new features — every change closes a gap between existing features.

