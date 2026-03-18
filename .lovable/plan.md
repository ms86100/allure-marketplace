

## Live Activity: Full Reliability & Debug Implementation

### What exists today
- Global orchestrator in `App.tsx` with realtime listeners, polling fallback (15s), delivery INSERT+UPDATE, app resume hydration
- `LiveActivityManager` with start/update/end, throttling, persistence, hydration
- `liveActivityDiagnostics.ts` with `runLiveActivityDiagnostics()` and `recordLAError()`
- `liveActivitySync.ts` with `syncActiveOrders()`
- Push Debug page at `/push-debug` accessible from Profile

### What's missing
1. No visible debug UI for Live Activity — all diagnostics are console-only
2. `LiveActivityManager` errors are recorded but never surfaced to UI
3. No way to manually test start/update/end on-device
4. No structured operation log (only `recentErrors` array for failures, no success tracking)

### Implementation Plan

#### 1. Create `LiveActivityDebugPage.tsx`
A dedicated debug screen (similar pattern to `PushDebugPage`) at `/la-debug` with:

**Device & Capability section:**
- Platform, OS info from Capacitor
- `isNativePlatform()` result
- Plugin availability (call `getActiveActivities` and show success/fail)

**Native State section:**
- List of currently active native activities (from `getActiveActivities()`)
- Current `live_activity_map` persisted data
- Recent errors from `getRecentLAErrors()`
- Last diagnostics result from `getLastDiagnostics()`

**Test Actions (buttons):**
- "Run Diagnostics" — calls `runLiveActivityDiagnostics(true)`
- "Start Test Activity" — calls `runLiveActivityDiagnostics(false)` (which does a real start/end cycle)
- "Sync Active Orders" — calls `syncActiveOrders(userId)` and shows count
- "End All Activities" — calls `LiveActivityManager.endAll()`

**Operation Log section:**
- Scrollable list showing every start/update/end attempt with success/failure, error message, timestamp

#### 2. Add structured operation log to `LiveActivityManager`
- Add an in-memory array `operationLog` (capped at 50 entries) tracking every `push`/`end` call with: `{ timestamp, action, entityId, status, success, error?, activityId? }`
- Persist to `live_activity_ops_log` key
- Export `getOperationLog()` for the debug page

#### 3. Add route and navigation
- Register `/la-debug` route in `App.tsx`
- Add "Live Activity Debug" menu item in `ProfilePage.tsx` next to "Push Debug"

#### 4. Files to create/modify
- **Create**: `src/pages/LiveActivityDebugPage.tsx`
- **Edit**: `src/services/LiveActivityManager.ts` — add operation log
- **Edit**: `src/App.tsx` — add route
- **Edit**: `src/pages/ProfilePage.tsx` — add menu link

