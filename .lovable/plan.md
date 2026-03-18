

## Add In-Flight Start Lock to LiveActivityManager

### Problem
The hydration race fix is in place (promise-based lock — good). But there's still a gap: after hydration completes, if `syncActiveOrders` fires 5 `push()` calls for the same order simultaneously, all 5 see `this.active` is empty (the first `startLiveActivity` hasn't resolved yet), and all 5 call `startLiveActivity` — creating duplicates.

### Fix
Add a `starting` Set that tracks entity IDs currently mid-start. This is a ~10-line change in `LiveActivityManager.ts`.

**In the class definition (line 90):**
```ts
private starting = new Set<string>();
```

**In `push()` at line 259, wrap the start block:**
```ts
if (!existing && START_STATUSES.has(workflow_status)) {
  // In-flight start lock — prevent concurrent starts for same entity
  if (this.starting.has(entity_id)) {
    console.log(TAG, `SKIP — start already in-flight for ${entity_id}`);
    return;
  }
  this.starting.add(entity_id);
  try {
    // ... existing startLiveActivity logic ...
  } catch (e) {
    // ... existing error handling ...
  } finally {
    this.starting.delete(entity_id);
  }
  return;
}
```

Also add permission error detection in the start catch block:
```ts
catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // If permission denied, disable future starts
  if (msg.includes('not authorized') || msg.includes('not allowed') || msg.includes('denied')) {
    this.canStart = false;
    console.warn(TAG, 'Permission denied — disabling future starts');
  }
  // ... existing error logging ...
}
```

### Files Changed

| File | Change |
|------|--------|
| `src/services/LiveActivityManager.ts` | Add `starting` Set + in-flight guard in `push()` + permission error catch |

Single file, ~15 lines net addition.

