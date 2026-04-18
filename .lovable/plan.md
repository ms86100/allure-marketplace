

## Goal
Beautify the **Order Detail page** and the **Orders list (history)** to feel modern, alive, and emotional — using animations and patterns already present in the project (`framer-motion`, `motion-variants`, `cardEntrance`, `staggerContainer`, `fadeSlideUp`, gradient fills, blur cards).

## What's wrong today (from screenshot + code review)
1. **Detail page sections look identical and disconnected** — every card is the same off-white tile with the same border. No visual hierarchy between hero, items, totals, payment, timeline.
2. **Cancelled state is sad and informationless** — just a tiny red icon + word "Cancelled". No empathy message, no reason summary, no "place again" CTA.
3. **OrderItemCard is plain** — no product image, no thumbnail, no per-item subtotal styling, status pill is generic.
4. **Totals row is flat** — Delivery + Total stacked with no visual separation, no item-count summary, no savings/discount line treatment.
5. **No micro-animations on entry** — sections appear all at once instead of staggered cascade. Cards do not respond to tap.
6. **Order list cards (OrdersPage)** — small thumbnail, status pills crammed, no progress indicator for active orders, no time-since-placed humanized ("2 min ago").
7. **Order Timeline** sits at the bottom looking like a footnote — should feel like a story arc.

## Plan — Order Detail page

### A. Hero Section redesign (when terminal/cancelled or delivered)
- For **cancelled**: full-width gradient banner (red→muted) with `XCircle` icon scaled in via spring, message "Order Cancelled" + reason snippet, plus **"Order Again"** button (reuses ReorderButton).
- For **delivered**: emerald gradient banner, animated checkmark (reuse the SVG from `OrderSuccessOverlay`), "Delivered on {date}" + Rate/Reorder CTAs.
- For **active**: keep ExperienceHeader but add a subtle animated gradient sheen on the status icon background (pulse).

### B. Items section — visual upgrade
- Section header gets a small icon chip (`Package` in a colored circle) instead of plain "ITEMS" caps.
- Each `OrderItemCard`:
  - Add 48×48 product thumbnail (fall back to category icon if no image).
  - Stagger entrance animation (`fadeSlideUp` with index delay).
  - Tap = subtle `whileTap scale 0.98`.
  - Status pill becomes a colored dot + label.
  - Quantity uses a soft pill `× 1` style.
- Subtle divider between items instead of separate boxes.

### C. Totals card — restructured
- Three clean rows: **Subtotal**, **Delivery** (with truck icon), **Total** (larger, primary color).
- Animated count-up on the total amount (when first mount only).
- "Saved ₹X" highlight in green if any discount.

### D. Payment card — clearer status
- Larger status icon, color-coded background (amber pending / green paid / red failed) with a soft gradient.
- Add small "Pay now" or "Mark received" CTA inline when actionable.

### E. Sections framing
- Replace the uniform `bg-card/80` blocks with **section group headers** (small uppercase label OUTSIDE the card with a colored leading bar) so the page reads as: Status → Fulfillment → Items → Totals → Payment → Timeline → Help.
- Vertical rhythm: tighten internal padding, increase gaps to `space-y-3.5` for clearer separation.
- Each card keeps backdrop-blur but gets a soft shadow `shadow-[0_2px_12px_-6px_rgba(0,0,0,0.08)]` and a left accent bar (2px) for active sections.

### F. Timeline upgrade
- Promote OrderTimeline visually: gradient vertical line, the latest event gets a pulsing ring, icons per event type (placed/accepted/picked/delivered) instead of generic dot.
- Show estimated next event ("Next: pickup expected ~5 min") when active.

### G. Entry animations
- Wrap all top-level sections in `motion.div` using existing `staggerContainer` + `cardEntrance` so the page **cascades in** from top.
- Status-icon in header: `scale-in` + 1s pulse for active phase.
- Number transitions on totals: simple count-up using framer-motion `useMotionValue + animate`.

## Plan — Orders list (history)

### H. OrderCard refresh
- Larger 56×56 image with rounded-2xl + subtle border.
- Two-line title: seller name (bold) + tiny order # in muted mono.
- **Active orders**: thin progress bar at the bottom of the card (uses `displayStatus.progressPercent`) with primary color fill.
- Status pill becomes a colored dot + label inline next to time.
- Humanized time: "2 min ago" / "Yesterday" / "Mar 12" (using `date-fns formatDistanceToNow`).
- Card hover/tap: lift with shadow + scale 0.98.
- Stagger entrance preserved.

### I. Filter chips polish
- Active chip gets a small dot indicator and gradient background.
- Counts inside chips when available ("Active 3").

### J. Empty state
- Already animated; add a subtle floating animation to the package icon (`y: [0, -4, 0]` infinite).

## Files to edit
- `src/pages/OrderDetailPage.tsx` — restructure section grouping, hero variants for cancelled/delivered, totals redesign.
- `src/components/order/OrderItemCard.tsx` — add thumbnail + animation + dot status.
- `src/components/order/ExperienceHeader.tsx` — add pulse sheen on icon.
- `src/components/order/OrderTimeline.tsx` — gradient line, per-event icons, pulsing latest event.
- `src/pages/OrdersPage.tsx` — `OrderCard` redesign with progress bar + humanized time + larger image; floating package on empty state.
- (Maybe new) `src/components/order/OrderTotalsCard.tsx` — extracted reusable totals block with count-up.
- (Maybe new) `src/components/order/OrderTerminalHero.tsx` — cancelled/delivered hero banner.

## Out of scope
- No DB / RLS / backend changes.
- No new data — purely presentation, using fields already fetched.
- No changes to the workflow engine or status logic.

