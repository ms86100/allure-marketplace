

# Fix: Broken Step Icon on Accepted + Lock Screen Media Controls for Order Sound

## Issue 1: Accepted step icon looks "broken" on buyer's order timeline

**Root cause**: In `OrderDetailPage.tsx` line 429, the current step gets `ring-2 ring-accent ring-offset-1 ring-offset-background`. On dark backgrounds, `ring-offset-background` creates a visible dark gap between the green circle and the ring, making it look cracked/broken compared to the plain completed circles.

**Fix** in `src/pages/OrderDetailPage.tsx` (line 429):

Replace:
```
ring-2 ring-accent ring-offset-1 ring-offset-background
```
With:
```
ring-2 ring-accent/50
```

This removes the offset entirely and uses a semi-transparent ring that looks clean on both light and dark themes. The current step still gets a distinct highlight ring without the visual gap.

## Issue 2: Order alert sound appears in iOS media controls (lock screen Now Playing)

**Root cause**: `useUrgentOrderSound.ts` uses `new Audio('/sounds/gate_bell.mp3')` — an `HTMLAudioElement`. On iOS, any HTMLAudioElement playback registers with the system's media session, which means:
- It shows "New Order Alert" in the lock screen Now Playing widget
- The user can pause/skip it from the notification shade
- It behaves like music, not an alert

**Fix** in `src/hooks/useUrgentOrderSound.ts`:

Replace `HTMLAudioElement` with **Web Audio API** (`AudioContext`). Web Audio API does NOT register with `navigator.mediaSession`, so:
- No lock screen media controls appear
- Sound plays as a short-lived audio context, not media playback
- Loop is implemented via a repeating `setTimeout` that creates new audio buffers

The approach:
1. Fetch `/sounds/gate_bell.mp3` once and decode into an `AudioBuffer`
2. On `playBeep()`, create an `AudioBufferSourceNode`, play it, and schedule the next play via `setTimeout` after the buffer duration
3. On `stopRinging()`, stop the source node and clear the timeout
4. The `AudioContext` is closed when the component unmounts

This is the same technique already used successfully for the foreground push notification beep (lines 422-440 of `usePushNotifications.ts`).

## Files changed

| File | Change |
|------|--------|
| `src/pages/OrderDetailPage.tsx` | Remove `ring-offset-1 ring-offset-background`, use `ring-2 ring-accent/50` for current step |
| `src/hooks/useUrgentOrderSound.ts` | Replace `HTMLAudioElement` with `AudioContext` + `AudioBuffer` loop to avoid media session |

## Expected result
- Order timeline: current step shows a clean highlighted ring without the dark gap artifact
- Lock screen: no more "New Order Alert" media widget — sound plays as a system-level audio burst
- Sound still loops continuously until the seller dismisses the notification

