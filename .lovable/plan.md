

# Buyer Journey Animation Upgrade — Comprehensive Plan

## Philosophy

The current animations are limited to home page section reveals. The buyer journey — from browsing to ordering to tracking — has almost zero animation at the interaction level. This plan covers every key buyer touchpoint with subtle, purposeful motion that provides feedback, guides attention, and creates delight.

## Buyer Journey Map + Animation Opportunities

```text
HOME → STORE → PRODUCT DETAIL → ADD TO CART → CHECKOUT → ORDER SUCCESS → ORDER TRACKING
  ↑                                                           ↑
  └── SEARCH ─────────────────────────────────────────────────┘
```

---

## 1. Order Success Celebration (Highest Impact — Currently Missing Entirely)

**Problem**: After placing an order, the user is just navigated to the order detail page with no celebration. This is the single most important emotional moment in the buyer journey.

**Solution**: Create a full-screen `OrderSuccessOverlay` component.
- Full green background that fades in
- Animated checkmark (SVG path drawing, like `CartClearedAnimation`)
- Confetti particles (lightweight CSS/framer-motion — no library)
- "Order Placed!" text scales in with spring
- Order summary slides up from bottom
- Auto-dismisses after ~3 seconds, revealing the order detail page underneath

**Files**: New `src/components/checkout/OrderSuccessOverlay.tsx`, modify `src/pages/OrderDetailPage.tsx` to show it when navigated from checkout (via location state)

---

## 2. Product Detail Sheet — Entrance & Interactions

**Problem**: The drawer opens with default Radix animation. Content inside is static. Add to cart button has no feedback.

**Changes**:
- Image: slight parallax effect on scroll (translate image Y slower than content)
- Price: count-up animation from 0 to actual price on sheet open
- "Add to cart" button: on tap, animate the button from green to a checkmark state with scale spring, then revert
- Quantity stepper: each +/- tap triggers a brief `badgePop` on the number
- Similar products row: stagger entrance with `cardEntrance`
- Seller info card: `slideFromLeft` entrance

**Files**: `src/components/product/ProductDetailSheet.tsx`

---

## 3. Add to Cart — Satisfying Feedback Chain

**Problem**: When user taps "Add to cart" on any product card, there is no visual celebration. The floating cart bar bounces, but the card itself is inert.

**Changes**:
- On `ProductCard` and `ProductListingCard`: when quantity goes from 0 to 1, flash a brief green checkmark overlay on the card (0.4s, fades out)
- The "+1" quantity badge: `badgePop` animation
- Floating cart bar: already has bounce — add a brief green flash ring around the cart icon

**Files**: `src/components/product/ProductCard.tsx`, `src/components/product/ProductListingCard.tsx`, `src/components/cart/FloatingCartBar.tsx`

---

## 4. Store/Seller Detail Page — Scroll-Driven Polish

**Problem**: The seller page is completely static. Products appear instantly.

**Changes**:
- Cover image: fade-in with slight scale (1.05 to 1.0 over 0.5s)
- Store info section (name, rating, badges): staggered `fadeSlideUp`
- Product grid: stagger each `ProductCard` with `cardEntrance`
- Category tabs: `filterChip` animation on tab switch, content cross-fades with `tabContent` variant
- "Menu" search input: `slideFromLeft` entrance

**Files**: `src/pages/SellerDetailPage.tsx`

---

## 5. Time Slot & Calendar Booking — Selection Feedback

**Problem**: Date and time slot buttons have only a CSS color change. No motion.

**Changes**:
- Date chips: `whileTap: { scale: 0.95 }` + selected state animates with `scaleIn` (brief spring)
- Time slot buttons: same `whileTap`, selected slot gets a brief `badgePop`
- Calendar expand/collapse: animate height with `slideUp` variant
- Booking confirmation step: content slides in from right

**Files**: `src/components/booking/TimeSlotPicker.tsx`, `src/components/booking/ServiceBookingFlow.tsx`

---

## 6. Search Page — Results & Interaction

**Problem**: Search results appear instantly with no animation.

**Changes**:
- Search input: focus animation (border expands, slight glow)
- Category filter chips: `filterChip` variant with `whileTap`
- Results grid: stagger with `staggerGrid` + `cardEntrance` for each product
- Empty state: `emptyState` variant (already exists, just needs to be applied)
- Autocomplete dropdown items: `listItem` stagger

**Files**: `src/pages/SearchPage.tsx`, `src/components/search/SearchAutocomplete.tsx`

---

## 7. Cart Page — Checkout Flow Polish

**Problem**: Cart items have exit animations but no entrance. The checkout flow feels transactional.

**Changes**:
- Cart items: `cardEntrance` stagger on page load
- Bill details section: numbers animate with `useCountUp` (total, delivery fee)
- "Place Order" button: `pulseRing` subtle glow when ready (all validations passed)
- Confirm dialog: content uses `scaleIn` + staggered content rows
- Payment method selector: selected method gets `badgePop`

**Files**: `src/pages/CartPage.tsx`, `src/components/payment/PaymentMethodSelector.tsx`

---

## 8. Orders List Page — Card Stagger

**Problem**: Order cards already have `whileTap` but no entrance animation.

**Changes**:
- Order cards: stagger with `cardEntrance` (already imported but not used on the list container)
- Tab switch: `tabContent` cross-fade between Active/Past
- Empty state: `emptyState` variant

**Files**: `src/pages/OrdersPage.tsx`

---

## 9. Order Detail Page — Status Transitions

**Problem**: Status changes are abrupt. The timeline appears instantly.

**Changes**:
- Status badge in header: `AnimatePresence` with `statusTransition` on status text changes
- Timeline steps: stagger with `listItem` variant
- Payment card: `glassFadeIn`
- Delivery ETA banner: `slideFromLeft` entrance

**Files**: `src/pages/OrderDetailPage.tsx`, `src/components/order/OrderTimeline.tsx`

---

## 10. Global Micro-Interactions

**Problem**: Buttons and interactive elements feel flat.

**Changes**:
- All primary `<Button>` components: add subtle `whileTap: { scale: 0.97 }` via a wrapper or direct application in key pages
- Favorite heart button: `badgePop` on toggle (scale 0 → 1.2 → 1)
- Toast notifications: already handled by sonner

**Files**: Selective application in the files listed above (not modifying the base Button component to avoid breaking changes)

---

## Implementation Summary

| # | Component | Animation Type | Impact |
|---|-----------|---------------|--------|
| 1 | OrderSuccessOverlay (NEW) | Full-screen celebration, confetti, checkmark drawing | Very High |
| 2 | ProductDetailSheet | Parallax, count-up price, button feedback | High |
| 3 | ProductCard/ListingCard | Add-to-cart flash, badge pop | High |
| 4 | SellerDetailPage | Cover fade, product stagger, tab cross-fade | High |
| 5 | TimeSlotPicker/BookingFlow | Selection spring, calendar height anim | Medium |
| 6 | SearchPage | Results stagger, filter chip motion | Medium |
| 7 | CartPage | Entrance stagger, count-up totals, pulse CTA | High |
| 8 | OrdersPage | Card stagger, tab cross-fade | Medium |
| 9 | OrderDetailPage | Status transitions, timeline stagger | Medium |
| 10 | Global buttons/favorites | whileTap scale, heart pop | Medium |

## Technical Details

- **New file**: `src/components/checkout/OrderSuccessOverlay.tsx` — full-screen animated celebration
- **Modified files**: ~12 files total
- **No new dependencies** — all using existing framer-motion + the motion-variants system
- **Performance**: All animations use `transform` and `opacity` only (GPU-accelerated). No layout-triggering properties.
- Location state flag `{ fromCheckout: true }` passed during navigation to trigger the success overlay only when arriving from checkout

