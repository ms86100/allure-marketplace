

## Analysis

The screenshots confirm Live Activities ARE working (the `AppDelegate` fix landed). But there are three clear bugs visible:

### Bug 1: Hydration Race Condition (causes duplicate activities)

In `LiveActivityManager.ts` line 126-128:
```ts
private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;  // ← set BEFORE async work completes
    // ... async native queries ...
}
```

When `syncActiveOrders` calls `push()` for 5 orders nearly simultaneously, the first call enters `hydrate()` and sets `hydrated = true`, then starts async native queries. The remaining 4 calls see `hydrated === true`, skip hydration entirely, find `this.active` empty (hydration hasn't populated it yet), and each calls `startLiveActivity` — creating 5 new native activities. This is the primary cause of the duplicates.

**Fix:** Replace the boolean flag with a promise-based lock so concurrent callers await the same hydration completion.

### Bug 2: Redundant Widget UI (title + subtitle show same thing)

In `liveActivityMapper.ts` line 29: `progress_stage: order.status` passes the raw status string. The widget then shows `statusTitle(workflowStatus)` as the headline AND `progressStage` as the subtitle — producing "Preparing / preparing" and "Ready for Pickup / ready".

**Fix:** Either set `progress_stage` to a richer description (e.g., "Your order is being prepared") or set it to `null` when there's no additional context beyond the status.

### Bug 3: No pre-check permission flow

The JS side calls `startLiveActivity` without first verifying permission. iOS shows the consent prompt AFTER activities are already attempted, which is backwards.

**Fix:** Add a `checkPermission` call before the first `startLiveActivity`, or handle the native rejection gracefully so the prompt appears before activity rendering.

---

## Plan

### 1. Fix hydration race in `LiveActivityManager.ts`

Replace the `hydrated: boolean` flag with a `hydrationPromise: Promise<void> | null` pattern:

```ts
private hydrationPromise: Promise<void> | null = null;

private async hydrate(): Promise<void> {
  if (!this.hydrationPromise) {
    this.hydrationPromise = this._doHydrate();
  }
  return this.hydrationPromise;
}

private async _doHydrate(): Promise<void> {
  // ... existing hydration logic (lines 130-182) ...
}

resetHydration(): void {
  this.hydrationPromise = null;
}
```

This ensures all concurrent `push()` calls await the same hydration promise, so `this.active` is fully populated before any start/update decisions.

### 2. Fix widget subtitle in `liveActivityMapper.ts`

Change `progress_stage` to provide meaningful context or null:

```ts
progress_stage: mapProgressStage(order.status, delivery),
```

Where `mapProgressStage` returns human-readable descriptions like "Your order is being prepared" for `preparing`, "Ready for you to pick up" for `ready`, includes driver/ETA info for `on_the_way`, and returns `null` for statuses where the title already says enough.

### 3. Fix widget Swift UI in `LiveDeliveryWidget.swift`

Update the lock screen banner to not show `progressStage` when it adds no value — only show it when it contains info distinct from the title (e.g., driver name, ETA context).

### 4. Add pre-start permission guard in `LiveActivityManager.ts`

Before the first `startLiveActivity` call, invoke `getActiveActivities()` as a capability probe (already done in hydration). If the native plugin rejects with "not enabled", surface that and skip starts. This is already partially handled but should be made explicit with a `canStart` flag set during hydration.

### Files Changed

| File | Change |
|------|--------|
| `src/services/LiveActivityManager.ts` | Promise-based hydration lock; permission guard |
| `src/services/liveActivityMapper.ts` | Meaningful `progress_stage` mapping |
| `native/ios/LiveDeliveryWidget.swift` | Conditional subtitle display |

