

# iOS Live Activity Widget Redesign

## Problems Visible in Screenshot

1. Three duplicate "Your Order is Ready" cards stacked on top of each other (dedup issue still manifesting on device)
2. A fourth card shows "We're Preparing Your Order" with nested duplicate content inside it
3. The purple gradient card looks dated and lacks information hierarchy
4. The dark card is functional but visually flat
5. No order short ID visible to help buyers distinguish orders
6. Emoji-heavy titles feel unpolished ("Your Order is Ready! 🎉")
7. No meaningful contextual info per status (e.g., "Pickup from [seller]" when ready, ETA countdown when in transit)

## What Changes

### A. ContentState — add `order_short_id` and `seller_logo_url`

Add two new fields to `LiveDeliveryAttributes.ContentState`:
- `orderShortId: String?` — last 4-8 chars of order ID for buyer recognition (e.g., "#7838")
- `sellerLogoUrl: String?` — seller logo URL for a branded feel (rendered if available)

Update `LiveActivityData` interface in `definitions.ts` and the mapper/APNs edge function to populate these.

### B. Widget Visual Redesign

Replace the current 3-branch lock screen layout with a single, unified, status-adaptive card:

**Layout structure (all statuses):**
```text
┌─────────────────────────────────────────────┐
│  [SocivaIcon]  Seller Name        #7838     │
│                                   2 items   │
│                                             │
│  Status Title (SF Symbol prefix)            │
│  Contextual subtitle                        │
│                                             │
│  ═══════●🛵═══════════════  ETA 8 min       │
└─────────────────────────────────────────────┘
```

**Design principles:**
- Single dark card with subtle status-tinted accent (not full gradient)
- SF Symbols instead of emojis for status icons (checkmark.circle.fill, fork.knife, bag.fill, bicycle, mappin.and.ellipse)
- Accent color changes per phase: amber (accepted/preparing), blue (ready), green (in transit), emerald (delivered)
- Clean typography: `.subheadline.bold` for title, `.caption` for subtitle
- Progress bar accent matches status color
- ETA displayed inline with progress bar when available
- Order short ID as a subtle badge in top-right

**Status-specific content:**
- **accepted**: "Order Confirmed" / "Seller is reviewing your order"
- **preparing**: "Being Prepared" / "Your order is being made"
- **ready**: "Ready for Pickup" / "Waiting to be picked up from {seller}"
- **picked_up/on_the_way/en_route**: "On the Way" / "{driver} · {distance} km away" + ETA badge
- **arrived**: "At Your Location" / "{driver} has arrived"
- **delivered/completed**: "Delivered" / full progress, green accent, auto-dismiss

**Dynamic Island (compact):**
- Leading: SocivaIcon
- Trailing: ETA in green if available, else mini progress ring

**Dynamic Island (expanded):**
- Same clean layout as lock screen but condensed
- No gradient backgrounds, just the standard Dynamic Island dark

### C. Files to Change

| File | Change |
|------|--------|
| `native/ios/LiveDeliveryAttributes.swift` | Add `orderShortId`, `sellerLogoUrl` to ContentState |
| `native/ios/LiveDeliveryWidget.swift` | Full redesign of lock screen view, DI regions, helper functions |
| `src/plugins/live-activity/definitions.ts` | Add `order_short_id`, `seller_logo_url` to LiveActivityData |
| `src/services/liveActivityMapper.ts` | Populate new fields from order data |
| `src/services/liveActivitySync.ts` | Pass `order_number` / short ID to mapper |
| `supabase/functions/update-live-activity-apns/index.ts` | Include new fields in APNs content-state, fetch order number |

### D. Scope Exclusion

The duplicate card issue (3x "Ready" cards in screenshot) is a LiveActivityManager dedup problem, not a widget design issue. That is tracked separately and is addressed by the existing hydration dedup logic. This plan focuses solely on the visual and informational quality of the widget.

