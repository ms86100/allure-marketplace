

# Blinkit-Style Rich Live Activity + Dynamic Island

## Reference (from screenshot)
The Dynamic Island expanded view shows:
- Dark background with app icon + brand
- Status subtitle: "Order is on the way"
- Bold ETA: "Arriving in 9 mins"
- Animated green progress bar with a delivery scooter emoji at the progress point
- Rich, visual, branded feel

## Changes Required

### 1. Data Model — Add `progressPercent` field

**`LiveDeliveryActivity.swift`** — Add to ContentState:
- `progressPercent: Double?` (0.0–1.0)
- `sellerName: String?`

**`definitions.ts`** — Add matching fields:
- `progress_percent: number | null`
- `seller_name: string | null`

### 2. Swift Widget — Complete Redesign

**Lock Screen Banner** — Status-dependent colored cards:

| Status | Background | Content |
|--------|-----------|---------|
| `accepted`, `confirmed` | Dark gray | App icon + seller name, "Order Confirmed", order info |
| `preparing` | Dark gray | "We're Preparing Your Order", animated progress bar (green, ~50%) |
| `ready` | Purple-blue gradient | "Your Order is Ready for Pickup!", seller name |
| `picked_up`, `en_route`, `on_the_way` | Dark gray | "Order is on the way", bold "Arriving in X mins", green progress bar with 🛵 scooter at progress point |
| `delivered`, `completed` | Green | "Order Delivered!" |

**Dynamic Island Expanded** (the screenshot reference):
- **Leading:** App icon + "Order is on the way" (or status text)
- **Trailing:** Bold "Arriving in X mins" or ETA
- **Bottom:** Full-width green progress bar with 🛵 emoji positioned at progress percentage
- Smooth SwiftUI animation on progress changes

**Dynamic Island Compact:**
- Leading: Sociva icon
- Trailing: ETA countdown ("9m") or a mini progress indicator

**Minimal:** Sociva icon (unchanged)

### 3. Progress Bar Component (SwiftUI)

Custom `DeliveryProgressBar` view:
- `GeometryReader` for width calculation
- Green rounded capsule background (dim) + foreground fill
- 🛵 emoji (`Text("🛵")`) positioned at `progressPercent * totalWidth`
- `.animation(.easeInOut(duration: 0.5))` for smooth transitions

### 4. Status-to-Progress Mapping

In `liveActivityMapper.ts`:
```
accepted    → 0.10
confirmed   → 0.10  
preparing   → 0.40
ready       → 0.75
picked_up   → 0.55
on_the_way  → 0.70
en_route    → 0.80
delivered   → 1.00
```

### 5. Data Pipeline Updates

**`liveActivityMapper.ts`** — Add `progress_percent` and `seller_name` to output.

**`liveActivitySync.ts`** — Join seller name:
```sql
.select('id, status, buyer_id, seller_id, seller:seller_profiles!orders_seller_id_fkey(business_name)')
```

**`useLiveActivityOrchestrator.ts`** — Pass seller name in realtime callbacks.

### 6. Native Plugin Updates

**`LiveActivityPlugin.swift`** — Read new fields:
- `call.getDouble("progress_percent")`
- `call.getString("seller_name")`

Pass them into `ContentState`.

## Files to Change

| File | Change |
|------|--------|
| `native/ios/LiveDeliveryActivity.swift` | Add `progressPercent`, `sellerName` to ContentState |
| `native/ios/LiveDeliveryWidget.swift` | Full redesign: status-dependent cards, progress bar with 🛵, rich Dynamic Island |
| `native/ios/LiveActivityPlugin.swift` | Read `progress_percent`, `seller_name` from bridge |
| `src/plugins/live-activity/definitions.ts` | Add `progress_percent`, `seller_name` fields |
| `src/services/liveActivityMapper.ts` | Add progress mapping + seller_name passthrough |
| `src/services/liveActivitySync.ts` | Join seller business_name in query |
| `src/hooks/useLiveActivityOrchestrator.ts` | Pass seller_name in realtime payloads |
| `src/hooks/useLiveActivity.ts` | Add new fields to hook options |

