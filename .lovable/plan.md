

# Harden Live Activities: Stale Cleanup, Persistent State, Android Dedup

## Changes

### 1. `src/plugins/live-activity/definitions.ts`
Add `cleanupStaleActivities` method to the plugin interface.

### 2. `src/plugins/live-activity/index.ts`
Add web no-op for `cleanupStaleActivities`.

### 3. `src/services/LiveActivityManager.ts`
- **Persistent state**: Save/load activity map via `persistent-kv` with versioned schema (`{ version: 1, activities: {...} }`)
- **Hydration order**: Load persisted map → query native activities → cleanup stale → then proceed with start/update
- **Stale cleanup**: After hydration, call `cleanupStaleActivities` with current valid entity IDs before creating new activities
- **Map size guard**: Cap at 10 entries, clean up oldest if exceeded
- **Persist on every start/end**: Write map to `live_activity_map` key

### 4. `native/ios/LiveActivityPlugin.swift`
- Add `cleanupStaleActivities` method that accepts `validEntityIds` array, ends all activities not in the list with a final content state
- Register in `pluginMethods` array
- Pass final `activity.content.state` to `activity.end()` to avoid stale widget content

### 5. `native/android/LiveDeliveryService.kt`
- Add `SharedPreferences` tracking of `active_entity_id`
- Check for duplicate before `startForeground()`
- Clear on `ACTION_STOP`
- Change `START_STICKY` → `START_NOT_STICKY` to prevent auto-restart
- Add `"ready"` to `statusTitle()`
- Add `@Synchronized` guard on service start logic

### Files Modified
- `src/plugins/live-activity/definitions.ts`
- `src/plugins/live-activity/index.ts`
- `src/services/LiveActivityManager.ts`
- `native/ios/LiveActivityPlugin.swift`
- `native/android/LiveDeliveryService.kt`
- `.lovable/plan.md`

