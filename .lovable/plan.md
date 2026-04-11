

# Order Detail Page: Design Elevation Plan

## Problems from Screenshot

1. **Emoji-based status header** — "🎉 Order completed" in the header looks cheap. Plain Unicode emojis feel unpolished for a production app.
2. **Celebration banner** — `🎊` with text is flat, not memorable. No animation, no visual impact.
3. **Vertical stepper too tall** — 8 steps (Placed → Accepted → Preparing → Ready → Picked Up → On the Way → Delivered → Completed → Payment Pending) take massive vertical space. Each step has ~48px height, totaling ~380px just for progress.
4. **Redundant steps visible** — "Completed" and "Payment Pending" appear after "Delivered" as future/dimmed steps, which is confusing on a completed order.

## Design Direction

### 1. Replace Emojis with Lucide Icons + Colored Badges

Remove all emoji usage from `ExperienceHeader` and `LiveActivityCard`. Replace with purpose-built icon badges:

| Phase | Current | New |
|-------|---------|-----|
| placed | 📋 | `ClipboardList` in blue circle |
| preparing | 👨‍🍳 | `ChefHat` in amber circle |
| ready | ✅ | `PackageCheck` in green circle |
| transit | 🛵 | `Bike` in purple circle |
| delivered | 🎉 | `CircleCheckBig` in green circle |
| cancelled | ❌ | `XCircle` in red circle |

Each icon renders inside a 32px glassmorphic circle with the phase color, giving a modern app-native feel.

**Files**: `src/lib/deriveDisplayStatus.ts` (replace emoji field with icon name), `src/components/order/ExperienceHeader.tsx`, `src/components/order/LiveActivityCard.tsx`

### 2. Celebration Banner → Animated Success Card

Replace the plain `🎊` text banner with a polished framer-motion card:
- Animated checkmark circle (draw-in SVG path animation)
- "Delivered in X min!" text fades in after checkmark completes
- Subtle confetti-like particle dots using framer-motion (4-6 small circles that scale in and fade)
- Green gradient glow behind the checkmark
- No emoji anywhere

**Files**: `src/pages/OrderDetailPage.tsx` (CelebrationBanner component)

### 3. Compact Stepper — Horizontal Pills for Completed, Vertical for Active

Replace the tall vertical stepper with a **hybrid layout**:

**When order is in-progress** (seller or buyer):
- Completed steps collapse into a single row of small green dot pills with labels (horizontal, ~32px height total)
- Current step: highlighted card with icon + label + hint (prominent, ~56px)
- Future steps: single row of muted dots (horizontal, ~32px)
- Total height: ~120px instead of ~380px

**When order is terminal** (delivered/cancelled):
- Show a compact summary: "Placed → Accepted → Preparing → Ready → Picked Up → Delivered" as a single horizontal flow with small checkmark dots connected by lines, all in one row (~48px total)
- No vertical stepper at all for completed orders

**Files**: `src/pages/OrderDetailPage.tsx` (seller stepper section), `src/components/order/LiveActivityCard.tsx` (buyer stepper)

### 4. Filter Out Redundant Terminal Steps

Steps like "Completed" and "Payment Pending" that appear after "Delivered" should be filtered from the stepper display. Only show steps up to and including the current terminal step.

**Files**: `src/pages/OrderDetailPage.tsx`, `src/components/order/LiveActivityCard.tsx`

## Technical Details

| File | Change |
|------|--------|
| `src/lib/deriveDisplayStatus.ts` | Replace `emoji: string` with `icon: string` (Lucide icon name) + `iconColor: string` |
| `src/components/order/ExperienceHeader.tsx` | Render Lucide icon in colored circle instead of emoji span |
| `src/components/order/LiveActivityCard.tsx` | Same icon treatment + compact horizontal stepper for completed steps |
| `src/pages/OrderDetailPage.tsx` | Redesign CelebrationBanner with SVG checkmark animation; compact seller stepper; filter redundant steps |

No DB changes. No new dependencies (Lucide + framer-motion already installed).

