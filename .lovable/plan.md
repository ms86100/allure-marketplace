

# Replace Seller Alert Sound with Persistent gate_bell.mp3

## What Changes

Two sound systems exist for sellers:

1. **`useNewOrderAlert.ts`** — `startBuzzing()` / `stopBuzzing()` using Web Audio API oscillators (square wave beeps every 3s). This drives the full-screen `NewOrderAlertOverlay`.
2. **`useUrgentOrderSound.ts`** — `playBeep()` using Web Audio API sine wave, repeating every 5s. Used in `useOrderDetail.ts` when a seller views an urgent order.

Both use synthesized beeps. The plan replaces them with the uploaded `gate_bell.mp3` played via an `<audio>` element configured to behave as an alarm, not media.

## Implementation

### Step 1: Copy the sound file
Copy `user-uploads://gate_bell.mp3` → `public/sounds/gate_bell.mp3`

Using `public/` ensures it's served as a static asset and can be loaded by `new Audio()` without bundler interference.

### Step 2: Rewrite `useNewOrderAlert.ts` buzzing logic

Replace `createAlarmSound()` + `AudioContext` with an `Audio` element approach:

```typescript
const audioRef = useRef<HTMLAudioElement | null>(null);

const startBuzzing = useCallback(() => {
  if (intervalRef.current) return;
  hapticNotification('warning');
  try {
    if (!audioRef.current) {
      audioRef.current = new Audio('/sounds/gate_bell.mp3');
    }
    const audio = audioRef.current;
    audio.loop = true;
    audio.volume = 1.0;
    // Prevent media session controls from pausing it
    audio.play().catch(() => {});
  } catch (e) {
    console.warn('[OrderAlert] Sound failed:', e);
  }
  // Haptic fallback every 3s
  intervalRef.current = setInterval(() => {
    hapticVibrate(500);
  }, 3000);
}, []);

const stopBuzzing = useCallback(() => {
  if (intervalRef.current) {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
  try {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.loop = false;
    }
  } catch {}
}, []);
```

Key behaviors:
- `loop = true` — sound rings continuously until stopped
- No `AudioContext` — uses `HTMLAudioElement` which is simpler and more reliable across browsers
- Sound stops only when `stopBuzzing()` is called (dismiss, dismissAll, or snooze)
- Haptic vibration continues as a parallel attention channel

Remove the `audioCtxRef`, `createAlarmSound` function, and all `AudioContext` references.

### Step 3: Rewrite `useUrgentOrderSound.ts`

Same approach — replace Web Audio oscillator with `gate_bell.mp3`:

```typescript
const audioRef = useRef<HTMLAudioElement | null>(null);

const playBeep = useCallback(() => {
  try {
    if (!audioRef.current) {
      audioRef.current = new Audio('/sounds/gate_bell.mp3');
    }
    audioRef.current.loop = true;
    audioRef.current.volume = 1.0;
    audioRef.current.play().catch(() => {});
  } catch {}
}, []);

const stopRinging = useCallback(() => {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current.loop = false;
  }
  // clear interval too
}, []);
```

### Step 4: Prevent media session hijack

Add `navigator.mediaSession` metadata so the OS doesn't show a "pause" button for regular media:

```typescript
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({ title: 'New Order Alert' });
  navigator.mediaSession.setActionHandler('pause', null);
  navigator.mediaSession.setActionHandler('stop', null);
}
```

This is added inside `startBuzzing` after `audio.play()` succeeds.

## Files Changed

| File | Change |
|------|--------|
| `public/sounds/gate_bell.mp3` | Copy uploaded file |
| `src/hooks/useNewOrderAlert.ts` | Replace `AudioContext`/oscillator buzzing with `Audio` element playing `gate_bell.mp3` on loop; nullify media session controls |
| `src/hooks/useUrgentOrderSound.ts` | Replace Web Audio beep with `gate_bell.mp3` on loop; stop only on explicit `stopRinging()` |

