

# Round 8: Production Readiness Audit

## Current State Assessment

After 7 rounds of hardening, the system is architecturally sound. All major subsystems are DB-backed:

- **Status lifecycle:** `category_status_flows` drives terminal/start sets via `statusFlowCache.ts`
- **Tracking config:** 18 parameters loaded from `system_settings` via `trackingConfig.ts`
- **Proximity thresholds:** DB-backed in both client (`LiveDeliveryTracker`) and server (`update-delivery-location`)
- **Status labels/emojis:** DB-backed via `delivery_status_labels` in `system_settings`
- **Live Activity progress/stages:** DB-backed via `category_status_flows` sort_order and display_label
- **Terminal status detection (APNs):** DB query to `category_status_flows.is_terminal`

All hardcoded values that remain are defensive safety-net fallbacks used only when DB queries fail. This is correct defensive programming.

---

## Finding 1: Delivery assignment exclusion filter is hardcoded (MEDIUM)

**Files:** `src/services/liveActivitySync.ts` line 82, `src/hooks/useLiveActivityOrchestrator.ts` line 115

Both files filter delivery assignments with `.not('status', 'in', '("cancelled","failed")')`. These two statuses are hardcoded inline rather than derived from `getTerminalStatuses()`. If a new terminal delivery status is added (e.g., `rejected`, `expired`), these filters will still return those assignments, potentially showing stale delivery data.

**Fix:** Use the already-loaded terminal statuses set to build the exclusion filter dynamically.

---

## Finding 2: `DEFAULT_ICON_MAP` and `DEFAULT_COLOR_MAP` in DeliveryStatusCard not DB-backed (LOW -- acceptable)

**File:** `src/components/delivery/DeliveryStatusCard.tsx` lines 39-58

These map delivery statuses to Lucide icon names and Tailwind color classes. They are visual presentation defaults used when `delivery_status_labels` DB config does not include `icon` or `color` keys. The DB config already supports overriding these via `icon` and `color` keys in the JSON. This is correct layering.

No action needed.

---

## Finding 3: `KNOWN_ROUTES` in useDeepLinks is hardcoded (LOW -- acceptable)

**File:** `src/hooks/useDeepLinks.ts` lines 9-12

Frontend route segments are inherently code-level concerns. Adding a new route always requires a code change. This cannot be DB-backed because it must be available synchronously at deep link parse time before any DB query completes.

No action needed.

---

## Finding 4: `DEFAULT_PROXIMITY` in LiveDeliveryTracker (LOW -- acceptable)

**File:** `src/components/delivery/LiveDeliveryTracker.tsx` lines 40-47

Defensive fallbacks used only when `proximity_thresholds` system_setting is absent. The DB value is confirmed present and active per network responses.

No action needed.

---

## Finding 5: `DEFAULTS` in trackingConfig.ts (LOW -- acceptable)

**File:** `src/services/trackingConfig.ts` lines 29-48

Defensive fallbacks for all 18 tracking parameters. DB values take precedence. These exist solely to prevent crashes if system_settings query fails.

No action needed.

---

## Verified: All Previously Fixed Items (Rounds 1-7)

| Area | Status |
|------|--------|
| GPS Kalman-lite filter | Verified in `gps-filter.ts` + `useDeliveryTracking.ts` |
| Smooth marker interpolation | Verified via CSS transitions |
| OSRM road ETA | Verified in `useOSRMRoute` |
| Proximity states (DB-backed) | Verified in `system_settings` + edge function |
| Deep link 404 prevention | Verified in `useDeepLinks.ts` |
| Live Activity dedup (hydration) | Verified in `LiveActivityManager._doHydrate()` |
| Native-layer dedup (start) | Verified via `getActiveActivities()` check |
| Activity lifecycle termination | Verified via terminal status check in `push()` |
| Stale ETA suppression | Verified in `getSmartEta` |
| Cart race conditions | Verified via mutation barrier |
| DB-backed active statuses (sync) | Verified: `getStartStatuses()` in `liveActivitySync.ts` |
| DB-backed flow entries (orchestrator) | Verified: `seller_delivery` included |
| DB-backed emoji config | Verified in `DeliveryStatusCard` |
| APNs terminal statuses (DB query) | Verified in `loadTerminalStatuses()` |
| APNs flow query aligned | Verified: `.in('transaction_type', ...)` |
| Seller logo (correct column) | Verified: `profile_image_url` |
| Proximity thresholds in edge function | Verified: `loadProximityThresholds()` |
| Location stale threshold (DB-backed) | Verified: `getTrackingConfigSync().location_stale_threshold_ms` |

---

## Implementation Plan

| Step | What | Severity | Files |
|------|------|----------|-------|
| 1 | Replace hardcoded `("cancelled","failed")` delivery assignment exclusion with DB-backed terminal statuses | Medium | `src/services/liveActivitySync.ts`, `src/hooks/useLiveActivityOrchestrator.ts` |

This is the only remaining actionable finding. The system passes the acceptance criteria for production readiness.

