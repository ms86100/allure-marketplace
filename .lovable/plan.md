

# Sociva Engine Transformation Plan — Blinkit-Level UX

## Current State Assessment

The system already has strong foundations:
- **State Layer**: Cart (useCart with mutex + optimistic updates), Orders (Realtime + Push + Polling), Delivery (background geo + Live Activities), Notifications (rich workflow + tiered delivery)
- **FloatingCartBar**: Already exists in AppLayout with thumbnails, count, total — mounted globally via `showCart` prop
- **ActiveOrderETA**: Already exists in Header — shows status + ETA for active orders
- **ActiveOrderStrip**: Exists on HomePage with rich order cards
- **Haptics**: Already integrated in all add-to-cart paths (`hapticImpact('medium')`)
- **CartPage**: Already a single-scroll checkout (items + payment + fulfillment + address + bill details + sticky CTA)

**Key finding**: Many "Blinkit-level" features already exist. The gaps are in **consistency**, **feedback unification**, and **perception optimization** — not missing features.

---

## Architecture: Three-Layer Engine Model

```text
┌─────────────────────────────────────────────┐
│  EXPERIENCE LAYER (UI Surfaces)             │
│  FloatingCartBar · ActiveOrderETA · Toasts  │
│  Product Cards · Cart Page · Tracking       │
├─────────────────────────────────────────────┤
│  BEHAVIOR LAYER (Engines)                   │
│  FeedbackEngine · VisibilityEngine          │
│  ProgressEngine · SyncEngine                │
├─────────────────────────────────────────────┤
│  STATE LAYER (Sources of Truth)             │
│  Cart (useCart) · Orders (Supabase)         │
│  Delivery (assignments) · Notifications     │
└─────────────────────────────────────────────┘
```

---

## Phase 1: Feedback Engine (Safe Additions)

### 1A. Unified Add-to-Cart Feedback Component

**Current**: Each product card calls `addItem()` + `hapticImpact('medium')` independently. No toast confirmation. No visual animation on the floating cart pill.

**Target**: Every `addItem()` call triggers a consistent, system-wide feedback chain:
1. Haptic pulse (already exists)
2. Brief success toast: "{Product name} added" (100ms perceived)
3. FloatingCartBar pill bounce animation (spring scale pulse)

**Implementation**:
- Create `src/lib/cartFeedback.ts` — a pure function `triggerCartFeedback(productName: string)` that fires toast + dispatches a `CustomEvent('cart-item-added')`
- Modify `useCart.tsx` `addItem()` to call `triggerCartFeedback` after successful optimistic update (not in every component — centralized)
- Modify `FloatingCartBar.tsx` to listen for `cart-item-added` event and trigger a `scale` spring animation on the pill

**Zero breakage**: Additive only. Existing haptic calls in components remain. Cart logic untouched.

### 1B. FloatingCartBar Enhancement

**Current**: Shows thumbnails + count + total. No animation on item add. No entrance on first item.

**Target**:
- Pill bounce on new item added (via `cart-item-added` event listener)
- Smooth entrance animation when cart goes from 0 → 1 items (already has AnimatePresence, just needs key change trigger)

**Implementation**:
- Add `useEffect` in FloatingCartBar listening for `cart-item-added` CustomEvent
- Trigger a `motionValue` or state-driven scale pulse (1 → 1.05 → 1, 200ms spring)
- Use `itemCount` as motion key so AnimatePresence triggers on first add

---

## Phase 2: Perception Layer

### 2A. ActiveOrderETA Enhancement

**Current**: Shows in header with status label + ETA minutes + chevron. Uses 30s stale time, 30s refetch. Listens for `order-terminal-push`.

**Issues found**:
- Terminal push listener is empty (line 52-55 — handler body is `// Will trigger refetch via invalidation` but never actually calls invalidate)
- No countdown animation (static number, not ticking)

**Target**:
- Fix the terminal push listener to actually invalidate the query
- Add a live countdown that ticks every 60s (not every second — too noisy)
- Add a subtle pulse animation when ETA changes
- Show "Arriving now" with a green accent when ETA ≤ 0

**Implementation**:
- In `ActiveOrderETA.tsx`, fix the `order-terminal-push` handler to call `queryClient.invalidateQueries({ queryKey: ['active-order-eta'] })`
- Add `useQueryClient` import and wire it up
- Add `refetchInterval: 60_000` to keep ETA current (already has 30s, keep it)
- Add conditional green styling for "Arriving now" state

### 2B. ActiveOrderStrip Enhancement

**Current**: Shows on home page. Has push-driven invalidation (working). Has `refetchOnWindowFocus: true`.

**Target**: Add a pulsing dot indicator for "on_the_way" / "at_gate" statuses to create activity illusion.

**Implementation**:
- Add a small animated dot (green pulse) next to status label when status is in transit statuses
- Use `motion.div` with infinite pulse animation
- Status detection from existing `display_label` / `status` field

---

## Phase 3: Flow Optimization

### 3A. Cart Page — Sticky Header Scroll Behavior

**Current**: Already a single-scroll checkout. Has sticky header + sticky footer.

**Target**: Add a mini bill summary in the sticky footer that collapses on scroll (user always sees total without scrolling to bill section).

**Implementation**:
- The sticky footer already shows total + "Place Order" button (line 265-268)
- This is already Blinkit-level. No change needed.

### 3B. Search Autocomplete with Thumbnails

**Current**: `SearchPage.tsx` uses text-based search with `TypewriterPlaceholder`. Results show as `ProductListingCard` grid.

**Target**: Add product image thumbnails in search suggestion dropdown.

**Implementation**:
- Modify `HomeSearchSuggestions.tsx` to include product image in suggestion rows
- Add `image_url` to the suggestion query if not already present
- Display as small 32x32 thumbnail left of suggestion text

### 3C. Category Navigation Depth Reduction

**Current**: Home → Categories page → Category group → Products (3 taps)

**Target**: Home → Category (with inline sub-category tabs) → Products (2 taps)

**Implementation**:
- Add horizontal scrollable sub-category chips at top of category results
- Filter products inline rather than navigating to a new page
- This is a medium-complexity change to `CategoriesPage.tsx` and `CategoryGroupPage.tsx`

---

## Phase 4: Consistency Framework

### System Rules (Enforceable)

| Rule | Enforcement |
|------|-------------|
| Same action → same feedback | All `addItem()` calls go through `useCart.addItem()` which calls `triggerCartFeedback` centrally |
| Cart always visible when items > 0 | `FloatingCartBar` mounted in `AppLayout` with `showCart` default `true` |
| No stale state after terminal | 4-tier sync (Realtime + Push + Visibility + Polling) + query invalidation |
| ETA always visible during active order | `ActiveOrderETA` mounted in `Header` component |
| Haptic on every tap action | Already enforced in all product cards + cart actions |

---

## Rollout Plan

| Phase | Changes | Risk | Dependencies | Rollback |
|-------|---------|------|-------------|----------|
| **1: Feedback Engine** | `cartFeedback.ts`, modify `useCart.tsx` addItem, FloatingCartBar animation | Low | None | Remove toast call + event listener |
| **2: Perception Layer** | Fix ActiveOrderETA invalidation bug, add pulse animations | Low | None | Revert animation additions |
| **3: Flow Optimization** | Search thumbnails, category chips | Medium | Search query changes | Revert query + UI changes |

---

## Edge Case Validation

| Scenario | Handling |
|----------|---------|
| Slow network | Optimistic UI in cart (already exists). Toast fires on optimistic update, not server confirm |
| Realtime failure | Push-driven sync (implemented). Polling 15s fallback |
| Push failure | Realtime primary + visibility sync on focus |
| Background → foreground | `appStateChange` listener re-hydrates. `refetchOnWindowFocus: true` on all critical queries |
| Rapid user actions | Per-product mutex in `addItemLocksRef` (already exists). Feedback fires once per successful add |

---

## Final Guarantees

| Question | Answer |
|----------|--------|
| Will any existing flow break? | **NO** — all changes are additive |
| Will any state become inconsistent? | **NO** — centralized feedback, existing sync architecture |
| Will UX become deterministic? | **YES** — same action = same feedback everywhere via centralized engine |
| Will perceived speed improve? | **YES** — cart bounce animation, toast confirmation, live ETA countdown, activity pulse |

---

## Implementation Priority (What to Build Now)

**Immediate** (Phase 1 + 2A bug fix):
1. Create `src/lib/cartFeedback.ts` — centralized feedback dispatcher
2. Wire into `useCart.tsx` `addItem()` — single integration point
3. Add bounce animation to `FloatingCartBar.tsx`
4. Fix `ActiveOrderETA.tsx` terminal push handler (actual bug — empty handler)
5. Add transit status pulse to `ActiveOrderStrip.tsx`

**Deferred** (Phase 3):
6. Search thumbnails in suggestions
7. Category navigation depth reduction

