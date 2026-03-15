

# Round 4 Audit: Smart Phone-Native Capabilities

## Implementation Status Matrix

| Phase | Feature | Status | Evidence |
|---|---|---|---|
| A | Enhanced Delivery Proximity | **Partially Implemented** | Edge function has en_route, 500m, 200m alerts. Missing: `vehicle_type` in payload, `DeliveryArrivalOverlay` not mounted anywhere |
| B | Multi-Interval Booking Reminders | **Implemented** | 1hr, 30min, 10min windows with dedup for buyer + seller |
| C | Predictive Ordering Engine | **Partially Implemented** | Table + edge function + UI exist. Missing: cron job not scheduled |
| D | One-Tap Server-Side Reorder | **Partially Implemented** | Edge function exists. Missing: cron job for generate-order-suggestions (feeds reorder), no deep-link handler for push notification `action: "Reorder"` |
| E | Historical ETA Intelligence | **Partially Implemented** | Table + trigger exist. Missing: `update-delivery-location` does NOT query `delivery_time_stats`, frontend does NOT show ETA range |
| F | Smart Arrival Detection | **Implemented** | Hook + card both exist and mounted on HomePage |
| G | Smart Delay Detection | **Implemented** | ETA spike >5min + heading reversal detection with dedup |
| H | Notification Payload Standardization | **Implemented** | All notification inserts include `type`, `entity_type`, `entity_id`, `workflow_status`, `action` |
| I | Lock Screen Dashboard | **Not Implemented** | Deferred (requires native plugin) — acceptable |

---

## Critical Gaps

### GAP-1: Cron jobs not scheduled (Critical)

`generate-order-suggestions` and `send-booking-reminders` have no `cron.schedule` entries. The edge functions exist but never run automatically. Without cron, predictive suggestions are never generated and booking reminders never fire.

**Fix**: Use the insert tool to create `cron.schedule` entries:
- `send-booking-reminders`: every 5 minutes (`*/5 * * * *`)
- `generate-order-suggestions`: daily at 6 AM (`0 6 * * *`)

### GAP-2: `DeliveryArrivalOverlay` not mounted (High)

Component exists at `src/components/order/DeliveryArrivalOverlay.tsx` but is not imported or rendered in any page. No order tracking page uses it.

**Fix**: Import and mount in the order tracking/detail page, passing delivery assignment distance/eta/rider data.

### GAP-3: `update-delivery-location` does not use `delivery_time_stats` (High)

The plan specified blending historical averages with GPS ETA when speed data is poor. The trigger populates `delivery_time_stats` correctly, but the edge function never queries it. The `calculateEta()` function uses a hardcoded 15 km/h fallback instead.

**Fix**: In `update-delivery-location`, when `speed_kmh` is null or < 2, query `delivery_time_stats` for `avg_delivery_minutes` for the seller/society pair and blend with Haversine estimate.

### GAP-4: Frontend does not show ETA range (Medium)

The plan specified showing "11-14 min" instead of a single number. No frontend code displays a range — all show `eta_minutes` as a single value.

**Fix**: Update order tracking UI to show `±2 min` range when historical data is available.

### GAP-5: `send-booking-reminders` missing from `config.toml` (High)

The function has no `[functions.send-booking-reminders]` entry in `config.toml`. This means JWT verification defaults may prevent it from being invoked by cron.

**Fix**: Add `[functions.send-booking-reminders]` with `verify_jwt = false` to `config.toml`.

### GAP-6: Missing `vehicle_type` in proximity payloads (Low)

The plan specified including `vehicle_type` in delivery proximity notification payloads. Not present — only `distance`, `eta`, `driver_name` are included. Minor cosmetic gap.

### GAP-7: No deep-link handler for push reorder action (Medium)

When a push notification with `action: "Reorder"` is tapped, there is no handler that intercepts this and calls `quick-reorder`. The `SmartSuggestionBanner` handles in-app reorder, but push-tap → reorder flow is not wired.

---

## Remediation Plan (Priority Order)

1. **Schedule cron jobs** (Critical) — Insert `cron.schedule` for `send-booking-reminders` (every 5 min) and `generate-order-suggestions` (daily 6 AM). Add `send-booking-reminders` to `config.toml`.

2. **Mount DeliveryArrivalOverlay** (High) — Find the order tracking page, import the component, and pass delivery assignment state.

3. **Blend historical ETA in edge function** (High) — Query `delivery_time_stats` in `update-delivery-location` when speed data is unavailable, blend with Haversine estimate.

4. **Wire push notification deep-link for reorder** (Medium) — In the push notification handler, detect `action: "Reorder"` payload and invoke `quick-reorder`.

5. **Show ETA range in frontend** (Medium) — Update tracking UI to display `eta ±2 min` range.

6. **Add vehicle_type to proximity payload** (Low) — Include rider vehicle info in delivery notifications.

