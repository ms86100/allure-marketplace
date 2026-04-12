

# Deep Animation Upgrade — Full Buyer Journey

## What's Already Done
- OrderSuccessOverlay exists (confetti + checkmark + green screen)
- Home page sections have staggered entrances
- OrdersPage has card stagger + filter chip `whileTap`
- FloatingCartBar has bounce on item add
- TimeSlotPicker has `whileTap` on date/time chips
- PaymentMethodSelector has animated checkmarks
- SellerDetailPage has cover image fade + info stagger

## What's Still Missing (The Gaps)

### 1. Product Detail Sheet — Zero Motion Inside
The drawer content is entirely static. No entrance animation for price, seller card, similar products, or the CTA button.

**Changes to `ProductDetailSheet.tsx`:**
- Image: fade-in with subtle scale (1.03 → 1) on sheet open
- Price text: brief count-up animation using `useCountUp`
- Product details section: replace `animate-fade-in` CSS with `motion.div` using `fadeSlideUp`
- Seller info card (line 201): wrap in `motion.div` with `slideFromLeft`
- Similar products row: wrap each item in `motion.div` with staggered `cardEntrance`
- CTA button area: `motion.div` with `fadeSlideUp` + 0.2s delay
- Quantity stepper (lines 279-282): wrap the quantity number in `AnimatePresence` + `motion.span` with `badgePop` on change

### 2. Product Card — Add-to-Cart Feedback
Currently the card has `whileTap` but no visual celebration when an item is added.

**Changes to `ProductCard.tsx`:**
- Wrap entire card in `motion.div` (already partially done for listing card)
- When quantity goes 0→1: flash a brief green checkmark overlay (opacity 0→1→0 over 0.5s) using a local `useState` + `AnimatePresence`
- Quantity number in stepper: `AnimatePresence` + `motion.span` key={quantity} with y-slide transition

### 3. Product Listing Card — Same Treatment
**Changes to `ProductListingCard.tsx`:**
- Same green flash overlay on first add
- Quantity number animation on increment/decrement

### 4. Favorite Heart Button — Pop Animation
Currently just a color change. No motion at all.

**Changes to `ProductFavoriteButton.tsx`:**
- Wrap `Heart` icon in `motion.div`
- On toggle to favorite: `animate={{ scale: [1, 1.3, 0.9, 1.1, 1] }}` (spring pop)
- On toggle to unfavorite: `animate={{ scale: [1, 0.8, 1] }}`

### 5. Cart Page — Entrance + Totals Animation
Cart items have exit animations but no entrance. Bill totals are static.

**Changes to `CartPage.tsx`:**
- Wrap seller group items in `motion.div` with staggered `cardEntrance` on page load (the `AnimatePresence` exists but items don't have entrance animation)
- Bill total numbers: use `useCountUp` for the total amount display (line 480)
- "Place Order" button: add `motion.div` with subtle `pulseRing` when button is enabled and ready
- Confirm dialog content rows: wrap in `motion.div` with staggered `fadeSlideUp`

### 6. Service Booking Flow — Step Transitions
Both steps render instantly with no transition.

**Changes to `ServiceBookingFlow.tsx`:**
- Wrap `step === 'select'` and `step === 'review'` content in `AnimatePresence mode="wait"` with `motion.div`
- Select step: slides in from left, review step: slides in from right
- "Continue" / "Confirm Booking" CTA: `whileTap={{ scale: 0.97 }}`
- Review step content cards: stagger with `cardEntrance`
- Price breakdown in review: numbers use `useCountUp`

### 7. Seller Detail Page — Tab Content Cross-Fade
Products appear instantly when switching category tabs.

**Changes to `SellerDetailPage.tsx`:**
- Wrap `TabsContent` children in `AnimatePresence mode="wait"` with `tabContent` variant
- Product grid within each category: wrap in `motion.div` with `staggerGrid`, each card with `cardEntrance`
- Search input: `motion.div` with `slideFromLeft` entrance

### 8. Order Detail Page — Timeline + Status Polish
Timeline steps and status badges appear instantly.

**Changes to `OrderDetailPage.tsx`:**
- Status badge: wrap in `AnimatePresence` with `statusTransition` keyed on status value
- Payment card section: wrap in `motion.div` with `glassFadeIn`
- Delivery ETA banner: `slideFromLeft` entrance

**Changes to `OrderTimeline.tsx`:**
- Already has stagger variants defined but check they're applied on the list container (they are — this is good)

### 9. Search Page — Enhanced Results
Results stagger was added but verify completeness.

**Changes to `SearchPage.tsx`:**
- Empty state: wrap in `motion.div` with `emptyState` variant
- Filter chips: add `whileTap={{ scale: 0.93 }}` if not already present

### 10. FloatingCartBar — Green Flash Ring
**Changes to `FloatingCartBar.tsx`:**
- On `cart-item-added` event: briefly show a green ring around the cart icon that expands and fades (using `motion.div` with scale 1→1.5 and opacity 1→0 over 0.4s)

## Files to Modify

| File | Key Animation |
|------|--------------|
| `ProductDetailSheet.tsx` | Image scale, price count-up, seller slide-in, similar stagger, CTA fade-up, quantity pop |
| `ProductCard.tsx` | Green flash on add, quantity number slide |
| `ProductListingCard.tsx` | Green flash on add, quantity number slide |
| `ProductFavoriteButton.tsx` | Heart pop spring |
| `CartPage.tsx` | Item entrance stagger, total count-up, CTA pulse, dialog stagger |
| `ServiceBookingFlow.tsx` | Step slide transitions, review stagger, CTA whileTap |
| `SellerDetailPage.tsx` | Tab content cross-fade, product grid stagger, search slide |
| `OrderDetailPage.tsx` | Status AnimatePresence, payment glassFadeIn, ETA slideFromLeft |
| `FloatingCartBar.tsx` | Green ring flash on add |
| `SearchPage.tsx` | Empty state animation, filter chip whileTap |

## Technical Notes
- All animations use existing `motion-variants.ts` presets — no new variants needed
- `useCountUp` hook already exists at `src/hooks/useCountUp.ts`
- Only `transform` and `opacity` properties used (GPU-accelerated, no layout thrashing)
- No new dependencies

