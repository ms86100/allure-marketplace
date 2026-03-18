

## Acknowledged Edge Risks and Mitigations

Your feedback is correct. The previous audit was overconfident. Here is the corrected assessment and a plan to address the real gaps.

### Corrected Verdict

| Risk | Real? | Severity |
|------|-------|----------|
| Timing mismatch (Live Activity updates before push arrives) | Yes | Low — converges within seconds |
| App killed → Live Activity stops, push continues | Yes | Medium — real UX divergence |
| Different wording between push and Live Activity | Yes | Low-Medium — can confuse users |
| No coordination / sequencing guarantee | Yes | Low — both show latest status eventually |

### Confirmed Wording Mismatches (Live Data)

| Status | Push Notification | Live Activity Widget |
|--------|------------------|---------------------|
| accepted | "✅ Order Accepted!" | "Your order has been accepted" |
| preparing | "👨‍🍳 Being Prepared" | "Your order is being prepared" |
| ready | "🎉 Order Ready!" | "Ready for pickup" |
| picked_up | "📦 Order Picked Up" | "Order picked up by rider" |
| on_the_way | "🚗 On The Way" | "On the way to you" |

These are semantically equivalent but worded differently, which can feel inconsistent.

### Plan: Three Targeted Fixes

**1. Unify wording between Push and Live Activity**

Update `liveActivityMapper.ts` `PROGRESS_DESCRIPTIONS` to match the push notification body text from `category_status_flows`. This way both channels show the same human-readable description. The lock-screen widget and notification banner will say the same thing.

**2. Suppress duplicate foreground alerts when Live Activity is active**

In the `pushNotificationReceived` handler in `usePushNotifications.ts`, check if a Live Activity is currently tracking the same order. If so, skip the toast and sound — the lock-screen widget already shows the update. This prevents the user from seeing two simultaneous alerts for the same event.

Implementation: Add a static method `LiveActivityManager.isTracking(entityId)` that checks the active map, then use it in the foreground notification handler to conditionally suppress the alert.

**3. Document app-killed divergence (no code fix needed now)**

When the app is killed, Live Activity stops updating while push continues. This is an inherent platform limitation. The real fix (server-side APNs push to update Live Activities) is already deferred to a future phase per the project strategy. No code change now, but this is explicitly acknowledged as a known gap.

### Files to Change

| File | Change |
|------|--------|
| `src/services/liveActivityMapper.ts` | Align `PROGRESS_DESCRIPTIONS` text with push notification templates |
| `src/services/LiveActivityManager.ts` | Add `isTracking(entityId): boolean` static method |
| `src/hooks/usePushNotifications.ts` | In foreground handler, suppress toast+sound when Live Activity is already tracking the order |

### What This Does NOT Change

- Push and Live Activity remain independent systems (correct architecture)
- No sequencing/coordination layer added (unnecessary complexity for current scale)
- Server-side Live Activity push remains deferred to future phase

