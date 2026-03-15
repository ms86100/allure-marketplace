

# Harden LiveActivityManager Against Duplicate Activities + Final Production Checks

## The Hidden Risk: Duplicate Lock-Screen Activities

The `LiveActivityManager` tracks active activities in an **in-memory Map**. This means:

- **App restart / cold launch while an activity is running** → the Map is empty, but a stale ActivityKit activity is still visible on the lock screen. The next `push()` call creates a **second** activity for the same entity.
- **Hot reload during development** → same problem.

This is the #1 production bug teams discover after shipping Live Activities.

## Fix

On every `push()` call (or at manager init), query `Activity<LiveDeliveryAttributes>.activities` on the native side to reconcile the in-memory Map with what iOS actually has running. This requires a new plugin method.

### Changes

**1. Add `getActiveActivities` method to the plugin interface**
- `src/plugins/live-activity/definitions.ts` — add `getActiveActivities(): Promise<{ activities: { activityId: string; entityId: string }[] }>`
- `src/plugins/live-activity/index.ts` — add web no-op returning empty array

**2. Add native implementation**
- `native/ios/LiveActivityPlugin.swift` — new `getActiveActivities` method that iterates `Activity<LiveDeliveryAttributes>.activities` and returns their IDs + entity IDs

**3. Reconcile on first push in LiveActivityManager**
- `src/services/LiveActivityManager.ts` — on first `push()`, call `getActiveActivities()` to hydrate the in-memory Map. End any orphaned activities that don't match current state.

**4. Final production hardening**
- Add `'ready'` to `START_STATUSES` validation in the widget Swift file (already in TS but widget `statusTitle` doesn't handle it)
- Update `LiveDeliveryWidget.swift` to handle the `"ready"` status title

### Files Modified
- `src/plugins/live-activity/definitions.ts`
- `src/plugins/live-activity/index.ts`
- `src/services/LiveActivityManager.ts`
- `native/ios/LiveActivityPlugin.swift`
- `native/ios/LiveDeliveryWidget.swift`
- `.lovable/plan.md`

