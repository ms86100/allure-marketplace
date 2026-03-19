

# Sociva UX — Final Behavioral Dominance Layer

## Current State

The system already has strong foundations: centralized feedback engine, floating cart bar with momentum CTA and mini preview, ETA emotional states, optimistic cart updates, and session scroll restore. The remaining work is about **visual weight reduction, action-surface dominance, and flow compression**.

---

## Changes

### 1. HomePage — Launchpad Reorder & Visual Weight Reduction
**File**: `src/pages/HomePage.tsx`

- **Remove** `SocietyTrustStrip` (redundant with header location stats) and `HomeSearchSuggestions` (redundant with header search bar + typewriter)
- **Reorder** remaining sections for shopping-first priority:
  1. Profile completion banner (conditional)
  2. `ActiveOrderStrip`
  3. `HomeNotificationBanner`
  4. `MarketplaceSection` (dominant — no dividers around it)
  5. `ForYouSection`
  6. `RecentlyViewedRow`
  7. `SocietyQuickLinks` (deprioritized)
  8. `SocietyLeaderboard` + `CommunityTeaser` (tertiary)
- **Remove** divider lines between sections — use spacing only (cleaner, lighter)
- Remove `SocietyTrustStrip` and `HomeSearchSuggestions` imports

### 2. ProductCard — Action-First Surface
**File**: `src/components/product/ProductCard.tsx`

**Vertical variant:**
- Reduce image aspect ratio from `aspect-square` to `aspect-[4/3]` (15-20% height reduction)
- Increase ADD button height from `h-8`/`sm` to `h-10` with larger text
- Make entire card lower half tappable for add-to-cart via an overlay click handler
- Increase stepper button touch targets to 44px minimum (`h-10 w-10`)

**Horizontal variant:**
- Reduce image from `w-24 h-24` to `w-20 h-20`
- Make price text bolder (`font-bold text-base`)
- Increase ADD button height and width, ensure 44px min touch target
- Make stepper buttons `h-9 w-9` minimum

### 3. ProductGridCard — Touch Target + Visual Weight
**File**: `src/components/product/ProductGridCard.tsx`

- Reduce card shadow by removing `shadow-card` from the class — use flat border only
- Increase ADD button padding from `px-5 py-1.5` to `px-6 py-2` (larger touch target)
- Increase stepper button padding from `px-2.5 py-1.5` to `px-3 py-2` (44px touch height)
- Make price text `font-bold text-sm` instead of `font-semibold text-[13px]`
- Remove hover scale effect, keep only `active:scale-[0.98]` for instant feel

### 4. ProductListingCard — Scan Speed + Touch Targets
**File**: `src/components/product/ProductListingCard.tsx`

- Reduce image aspect ratio from `aspect-[4/3]` to `aspect-[5/4]` — less image, more action
- Increase ADD button from `text-[10px] px-4 py-1` to `text-[11px] px-5 py-1.5`
- Increase stepper buttons from `px-2.5 py-1` to `px-3 py-1.5`
- Make price `font-bold text-[14px]` for scan speed
- Reduce product name from `line-clamp-2` to `line-clamp-1` — faster scanning
- Remove bottom gradient overlay on image (unnecessary visual weight)

### 5. FloatingCartBar — Checkout Gravity
**File**: `src/components/cart/FloatingCartBar.tsx`

- When `isMomentum` (3+ items): increase pill shadow intensity and add subtle glow
- Add "Added ✓" flash: on `cart-item-added` event, briefly show "Added ✓" text for 1.5s overlaying item count, then fade back
- Change momentum CTA from "Checkout" to "Checkout now →" for urgency

### 6. Card Component — Reduce Visual Weight Globally
**File**: `src/components/ui/card.tsx`

- Remove `shadow-card` from default Card class — cards should be flat with border only
- This globally reduces visual weight across all card surfaces

### 7. ParentGroupTabs — Uniform Quick-Entry Grid
**File**: `src/components/home/ParentGroupTabs.tsx`

- Remove gradient/tint backgrounds on inactive tabs — use pure `bg-secondary` only
- Ensure uniform sizing (already `w-14 h-14` circles — good)
- Increase tap target by adding `min-w-[56px] min-h-[56px]` explicitly

### 8. MarketplaceSection — Dominate Screen
**File**: `src/components/home/MarketplaceSection.tsx`

- Remove `SectionDivider` gradient dividers between discovery rows — use simple spacing
- Remove `bg-secondary/20` wrapper on popular row — flatten it
- Remove `bg-secondary/30` wrapper on store discovery — flatten

---

## Technical Details

- ~8 files modified, zero new files
- No backend changes, no DB changes
- All changes are CSS/class-level or layout reordering
- Touch target enforcement: minimum 44px on all interactive elements
- Shadow removal is global via Card component change
- "Added ✓" flash uses existing `cart-item-added` event listener with a `useState` timer

## Implementation Order

| Phase | Files | Risk |
|-------|-------|------|
| 1: Layout | `HomePage.tsx`, `card.tsx` | None |
| 2: Action Surfaces | `ProductCard.tsx`, `ProductGridCard.tsx`, `ProductListingCard.tsx` | Low |
| 3: Momentum | `FloatingCartBar.tsx`, `ParentGroupTabs.tsx`, `MarketplaceSection.tsx` | None |

