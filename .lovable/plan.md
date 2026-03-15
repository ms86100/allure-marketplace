

# Phase I — Lock Screen Live Activities Implementation

## Scope and Constraints

Lovable can create all TypeScript/web-layer code and provide native code files (Swift, Kotlin) as reference implementations. However, native iOS/Android code cannot be compiled or tested within Lovable — the user must build locally with Xcode/Android Studio after exporting to GitHub.

## What Will Be Created

### 1. Capacitor Plugin Bridge (TypeScript definitions)
**File**: `src/plugins/live-activity/definitions.ts`

Define the `LiveActivityPlugin` interface with three methods:
- `startLiveActivity(data: LiveActivityData): Promise<{ activityId: string }>`
- `updateLiveActivity(data: LiveActivityData): Promise<void>`
- `endLiveActivity(opts: { activityId: string }): Promise<void>`

**File**: `src/plugins/live-activity/index.ts`

Register the plugin via `registerPlugin('LiveActivity')` with web fallback (no-op).

### 2. LiveActivityManager Service
**File**: `src/services/LiveActivityManager.ts`

Singleton service responsible for:
- Tracking which entity currently has an active live activity (one at a time)
- Throttling updates (max once per 5 seconds)
- Starting activity on order accepted/picked_up or booking confirmed
- Updating on delivery tracking changes (GPS, ETA, status)
- Ending on terminal states (delivered, completed, cancelled, no_show)
- Platform check — only runs on native iOS/Android

### 3. Integration Hook
**File**: `src/hooks/useLiveActivity.ts`

Hook that connects `useDeliveryTracking` state and order status to `LiveActivityManager`. Mounted in `OrderDetailPage.tsx` — when tracking data changes, it calls start/update/end as appropriate.

### 4. Native iOS Files (Reference Implementation)
**Files created in project for user to copy into Xcode**:
- `native/ios/LiveDeliveryActivity.swift` — ActivityKit activity definition with `LiveActivityData` attributes
- `native/ios/LiveDeliveryWidget.swift` — SwiftUI widget rendering ETA, distance, status progress bar, Dynamic Island compact/expanded views
- `native/ios/LiveActivityPlugin.swift` — Capacitor plugin bridge calling ActivityKit APIs

### 5. Native Android Files (Reference Implementation)
- `native/android/LiveDeliveryService.kt` — Foreground service with ongoing notification showing ETA/distance/status, `setOnlyAlertOnce(true)` for silent updates
- `native/android/LiveActivityPlugin.kt` — Capacitor plugin bridge starting/updating/stopping the service

### 6. Config Updates
- Add plugin registration guidance to `capacitor.config.ts` comments
- Update `.lovable/plan.md` to mark Phase I as implemented

## Integration Points

The `useLiveActivity` hook will:
1. Watch `deliveryTracking` state from `useDeliveryTracking`
2. Watch order `status` from `useOrderDetail`
3. On status entering active states → `startLiveActivity`
4. On tracking updates (eta, distance, status change) → `updateLiveActivity` (throttled)
5. On terminal status → `endLiveActivity`

## Safety

- Dedup: one active activity per entity, tracked by `entity_id`
- Throttle: updates batched to max 1 per 5 seconds
- Graceful degradation: web platform returns no-op, errors are caught silently
- Auto-cleanup: terminal status always ends the activity

## File Count: ~8 new files, 2 modified files

