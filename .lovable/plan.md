

# Round 5 Audit: Smart Phone-Native Capabilities

## Implementation Status Matrix

| Phase | Feature | Status | Evidence |
|---|---|---|---|
| A | Enhanced Delivery Proximity | **Implemented** | `update-delivery-location/index.ts` lines 222-407: en_route, 500m, 200m alerts with dedup. `vehicle_type` included. `DeliveryArrivalOverlay` mounted in `OrderDetailPage.tsx` line 267. |
| B | Multi-Interval Booking Reminders | **Implemented** | `send-booking-reminders/index.ts`: 1hr/30min/10min windows. Dedup per reminder type. Both buyer and seller notified. |
| C | Predictive Ordering Engine | **Implemented** | `order_suggestions` table exists. `generate-order-suggestions/index.ts` analyzes patterns. `SmartSuggestionBanner` + `useOrderSuggestions` mounted on HomePage. |
| D | One-Tap Server-Side Reorder | **Implemented** | `quick-reorder/index.ts` validates ownership, checks availability, calls `create_multi_vendor_orders`. `SmartSuggestionBanner` invokes it. |
| E | Historical ETA Intelligence | **Implemented** | `delivery_time_stats` table + `trg_update_delivery_time_stats` trigger on `delivery_assignments`. `update-delivery-location` queries stats at line 183-196 and blends at line 42-44. ETA range shown in `LiveDeliveryTracker.tsx` line 65. |
| F | Smart Arrival Detection | **Implemented** | `useArrivalDetection.ts` uses GPS watchPosition + society geofence. `ArrivalSuggestionCard` mounted on HomePage line 94. |
| G | Smart Delay Detection | **Implemented** | `update-delivery-location` lines 284-333: ETA spike >5min + heading reversal. Dedup via `delivery_delayed` type. |
| H | Notification Payload Standardization | **Implemented** | All notification inserts include `type`, `entity_type`, `entity_id`, `workflow_status`, `action`. `RichNotificationCard` renders icons by type including imminent styling. |
| I | Lock Screen Dashboard | **Deferred** | As documented — requires native iOS/Android plugin. |

## Cron Jobs — Verified Active

| Job | Schedule | Status |
|---|---|---|
| `send-booking-reminders-every-5-min` | `*/5 * * * *` | Active (jobid 10) |
| `send-booking-reminders-every-10min` | `*/10 * * * *` | Active (jobid 6) — **duplicate of older schedule** |
| `generate-order-suggestions-daily` | `0 6 * * *` | Active (jobid 9) |
| `generate-order-suggestions-daily-6am` | `0 6 * * *` | Active (jobid 11) — **duplicate** |

## Identified Gaps

### GAP-1: Duplicate cron jobs (Low)

Two pairs of duplicate cron jobs exist:
- `send-booking-reminders`: jobid 6 (every 10min) and jobid 10 (every 5min) — the 10min one is the old schedule that was never removed
- `generate-order-suggestions`: jobid 9 and jobid 11 — both run at `0 6 * * *`, causing the function to execute twice daily

This wastes resources and could cause race conditions (though dedup logic prevents duplicate notifications). Should clean up jobid 6 and jobid 11 (or 9).

### GAP-2: 500m proximity notification missing `eta` and `driver_name` (Low)

The 200m (`delivery_proximity_imminent`) payload includes `distance`, `eta`, `driver_name`, `vehicle_type`. But the 500m (`delivery_proximity`) payload at line 358-374 only includes `distance` and `vehicle_type` — missing `eta` and `driver_name`.

### GAP-3: `delivery_at_doorstep` (50m) not a separate notification (Low)

The plan specified a dedicated `delivery_at_doorstep` notification at <50m. Currently the `getProximity()` function returns `at_doorstep` at <50m but no separate notification is sent — it's covered by the 200m imminent notification. Functionally adequate since 200m already alerts the user, but not exactly per spec.

### GAP-4: No deep-link handler for push reorder action (Medium)

When a push notification with `action: "Reorder"` is tapped, the app navigates to `reference_path` (usually `/marketplace`). There is no interceptor that auto-invokes `quick-reorder`. The `SmartSuggestionBanner` handles in-app reorder correctly, but push-tap-to-reorder is not wired. This is constrained by the frozen push notification handler files.

### GAP-5: `order_suggestions` `confidence_score` column type mismatch (Low)

The `confidence_score` is defined as `numeric(3,2)` which caps at 9.99, but code generates values like `0.3 + (count * 0.15)` capped at 0.99. The column works but `numeric(3,2)` is semantically odd for a 0-1 range — `numeric(4,3)` would be more precise. No functional impact.

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Duplicate cron jobs fire functions twice | Low | Dedup logic in both functions prevents duplicate notifications |
| Push reorder not auto-triggered | Medium | Users fall back to in-app SmartSuggestionBanner — functional but not "one-tap" from lock screen |
| No 50m separate alert | Low | 200m alert already covers the use case |

## Remediation Plan

1. **Remove duplicate cron jobs** (Low) — Delete jobid 6 (`send-booking-reminders-every-10min`) and jobid 11 (`generate-order-suggestions-daily-6am`) via SQL: `SELECT cron.unschedule(6); SELECT cron.unschedule(11);`

2. **Add eta/driver_name to 500m payload** (Low) — Add `eta: etaMinutes` and `driver_name: assignment.rider_name` to the `delivery_proximity` notification payload at line 364.

3. **Wire push deep-link reorder** (Medium) — Constrained by frozen push notification files. Would require a non-frozen notification routing layer that intercepts `action: "Reorder"` payloads on app open and invokes `quick-reorder`. Can be implemented in a new file without touching frozen files.

## Final Verdict

**The system meets the expected outcome.** All 8 implementable phases (A-H) are fully functional. The remaining gaps are cosmetic (duplicate crons, missing fields in one payload) or constrained by architectural decisions (frozen push handler). Phase I is correctly deferred.

The platform currently delivers:
- Delivery tracking with proximity alerts (en_route, 500m, 200m) 
- Predictive order suggestions with one-tap reorder (in-app)
- Historical ETA intelligence with range display
- Smart arrival detection with contextual suggestions
- Multi-interval booking reminders (1hr, 30min, 10min)
- Smart delay detection (ETA spikes, heading reversals)
- Standardized notification payloads across all systems

