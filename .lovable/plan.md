

# Zomato-Level Order Tracking — Implementation Plan

This transforms the buyer and seller order detail page from a workflow-stepper UI into an experience-first tracking system. The DB workflow engine remains untouched — all changes are UI-layer only.

---

## What Changes

### 1. Create `deriveDisplayStatus` utility
**File**: `src/lib/deriveDisplayStatus.ts`

Maps internal workflow states to a single human sentence + ETA flag:

| Internal States | Display |
|---|---|
| placed, payment_pending | "Order placed" |
| accepted, preparing | "Preparing your order" |
| ready, ready_for_delivery | "Ready for pickup" / "Assigning delivery partner" |
| picked_up | "Picked up · On the way" |
| on_the_way, in transit states | "Arriving in X mins" (uses OSRM ETA) |
| delivered, completed | "Delivered" |
| cancelled | "Cancelled" |

ETA delay flag computed from `estimated_delivery_at` vs current OSRM ETA:
- On time (within 5 min of estimate)
- Slight delay (+3-5 min)
- Delayed (+5+ min)

**Progress percent**: `progress_percent = (total_route_distance - remaining_distance) / total_route_distance` — uses OSRM route distance already available in `DeliveryMapView`.

### 2. Create `ExperienceHeader` component
**File**: `src/components/order/ExperienceHeader.tsx`

Replaces the current "Order Summary" header:
- Seller/restaurant name (prominent)
- Single primary status sentence (from `deriveDisplayStatus`)
- ETA badge pill: "Arriving in 25 mins · On time"
- Manual refresh button (triggers `invalidateOrder()` with spinner)
- Back + chat buttons preserved

### 3. Create `LiveActivityCard` component
**File**: `src/components/order/LiveActivityCard.tsx`

Sticky Zomato-style card:
- 3-node progress line: Restaurant → Rider → Home
- Animated dot position based on `progress_percent`
- Status sentence + ETA with CSS `animate-fade-in` transitions on change
- Pulse animation on rider node when moving
- Uses framer-motion (already in project) for number transitions

**Fallback handling** (Condition #4):
- GPS unavailable: "Tracking temporarily unavailable" with last known position frozen
- Network failure: Retry silently, show stale data with "Last updated X mins ago"
- API errors: Graceful degradation to distance-based ETA

### 4. Enhance `DeliveryMapView`
**File**: `src/components/delivery/DeliveryMapView.tsx`

Build on existing Leaflet map:
- **Add seller/restaurant marker** (using `seller.latitude/longitude` already available)
- **Dynamic zoom logic** (Condition implicit):
  - distance > 5km: zoom out (zoom 12)
  - 2-5km: medium (zoom 14)
  - < 1km: zoom in smoothly (zoom 16)
- **Auto camera**: focus restaurant before pickup, follow rider after, zoom home near delivery
- **Tap rider marker**: show mini popup with name, ETA, distance (enhance existing Popup)
- **Map height**: increase from `h-[260px]` to `h-[320px]` during transit, make it the first visual element
- **GPS smoothing** (Condition #2): Add to `AnimatedRiderMarker`:
  - Ignore jumps > 200m in < 2s (using timestamp + haversine check)
  - Keep last 3 points for weighted average smoothing
  - Already has cubic ease-out interpolation

### 5. Refactor `OrderDetailPage` layout
**File**: `src/pages/OrderDetailPage.tsx`

**Buyer view restructure:**
- Replace header (lines 311-332) with `ExperienceHeader`
- Replace stepper timeline (lines 430-474) with `LiveActivityCard`
- Move map + tracker ABOVE order details during transit
- Collapse items section by default during transit (expandable)
- Keep all action bars, OTP dialogs, payment flows, chat untouched

**Seller view** (Condition #5):
- Same `ExperienceHeader` with seller-appropriate labels
- Clear single-action CTA (no "Awaiting next step" ambiguity — show contextual message like "Waiting for delivery partner to pick up")
- Delivery handoff: existing OTP verification flow is mandatory and stays
- Transitions remain DB-driven, just presented cleanly

### 6. CSS animations
**File**: `src/styles/tracking-animations.css`

- Number flip for ETA changes
- Fade transition for status text
- Progress line smooth movement
- Pulse on rider node
- All using existing Tailwind keyframe system + custom CSS

### 7. ETA improvements (Condition #1)
- **Primary**: OSRM route duration (already fetched in `useOSRMRoute` — `route.duration`)
- **Secondary**: Last known speed × distance fallback
- **Buffer**: +2 min base + traffic factor from time of day
- No new API needed — OSRM already returns duration

---

## What Does NOT Change
- Zero database migrations
- `useOrderDetail` hook internals
- Workflow engine (category_status_flows, transitions)
- Action bars (seller/buyer advance, reject, cancel)
- OTP dialogs, payment confirmation flows
- Chat, LiveActivityManager, SellerGPSTracker
- All existing realtime subscriptions

## Files Summary

| File | Action |
|---|---|
| `src/lib/deriveDisplayStatus.ts` | Create |
| `src/components/order/ExperienceHeader.tsx` | Create |
| `src/components/order/LiveActivityCard.tsx` | Create |
| `src/styles/tracking-animations.css` | Create |
| `src/pages/OrderDetailPage.tsx` | Major refactor (layout + remove stepper) |
| `src/components/delivery/DeliveryMapView.tsx` | Enhance (seller marker, dynamic zoom, GPS smoothing) |

