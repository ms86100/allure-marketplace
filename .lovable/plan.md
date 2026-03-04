

## Confirmed: Periodic Interval Will Use `useRef` + Cleanup

You're right to flag this. The periodic `setInterval` has **not been implemented yet** — the previous message was a plan only. Here's exactly how it will be implemented safely:

### Implementation Details

**File:** `src/hooks/usePushNotifications.ts`

**1. No timer accumulation — interval lives inside the `useEffect` gated on `[userId]` (line 938–1061)**

The `setInterval` will be created inside this existing effect and cleared in the existing teardown at line 1052. Since this effect already tracks `tornDown` and cleans up via `appListenerCleanup`, the interval cleanup follows the same proven pattern:

```typescript
// Inside the userId effect, after the login registration block (~line 1048):
const periodicInterval = setInterval(() => {
  if (!userRef.current || !Capacitor.isNativePlatform()) return;
  reconcileRuntimeTokenRef.current('periodic_check').catch((e) => {
    pushLog('warn', 'Periodic reconcile failed', { error: String(e) });
  });
}, 15 * 60 * 1000);

// In the existing teardown (line 1052):
return () => {
  tornDown = true;
  clearInterval(periodicInterval);  // ← added
  // ... existing cleanup ...
};
```

Because the interval is a **local variable** inside the effect, and React guarantees the cleanup runs before re-running the effect when `userId` changes, multiple timers **cannot accumulate**.

**2. Resume reconciliation — remove early return on `registered` state (line 836)**

Change line 836 from:
```typescript
if (state === 'registered') return;
```
To:
```typescript
if (state === 'registered' && userRef.current) {
  reconcileRuntimeTokenRef.current('resume_check').catch(() => {});
  return;
}
if (state === 'registered') return;
```

This ensures token rotation is caught on every app resume, even when already registered.

### Summary
- **1 file** changed: `src/hooks/usePushNotifications.ts`
- **~8 lines** added
- No `useRef` needed — the local `const` inside the effect + React's cleanup guarantee is sufficient and matches the existing cleanup pattern in this file
- No database or edge function changes

