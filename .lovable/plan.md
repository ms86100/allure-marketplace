

# App Launch Experience — Splash + Loading State Plan

## Current State

- **Android native**: Shows a static `splash.png` (dark background with SOCIVA text) for 2 seconds, then the WebView loads
- **Web layer**: Shows skeleton loaders (`PageLoadingFallback`) during auth hydration — no branded splash
- **Result**: User sees a plain "SOCIVA" screen, then an abrupt jump to either skeletons or the app. No animation, no polish.

## What We Will Build

A two-layer splash system: the native splash (already exists) transitions into a **web-layer animated splash** that plays the uploaded video, waits for auth readiness, then smoothly transitions to the app.

```text
Native splash.png (instant, 0-2s)
        │
        ▼
Web Splash Screen (video + loading)
  - Plays uploaded MP4
  - Waits for auth session restore
  - Min 1.5s, max 3s hard cap
        │
        ▼
Smooth fade-out → App content
  (no white flash, no skeleton flash)
```

## Implementation

### 1. Add Video Asset to Project

- Copy `download.mp4` to `public/splash-video.mp4`
- This ensures it loads immediately from local assets (no network dependency on native builds)
- File will be bundled into the `dist/` folder for Capacitor builds

### 2. New Component: `src/components/splash/AppSplashScreen.tsx`

A full-screen overlay that:

- Renders on top of everything with `fixed inset-0 z-[9999]`
- Background: `#1a1a2e` (matches native splash and app theme)
- Plays the uploaded MP4 video: centered, `autoPlay`, `muted`, `playsInline`
- Has a fallback: if video fails to load within 500ms, shows an animated SVG version of the SOCIVA logo (same as `sociva_app_icon_2.svg` but with framer-motion scale-in)
- Shows a subtle loading indicator below the video (thin progress bar or pulsing dot)
- Uses framer-motion `AnimatePresence` for exit: `opacity: 0` + `scale: 1.05` over 400ms

### 3. Splash Lifecycle Logic (in `App.tsx`)

Add state management at the top level of the `App` component:

```text
const [splashDone, setSplashDone] = useState(false)
```

- `AppSplashScreen` receives a `ready` prop from auth state (`isSessionRestored`)
- Internal timer logic in the splash component:
  - Minimum display: 1.5s (so it never flashes and disappears)
  - As soon as `ready` is true AND min time elapsed → begin exit animation
  - Hard cap: 3s — force exit even if auth isn't ready (app will show its own loading states)
- When exit animation completes → `setSplashDone(true)` → splash unmounts
- While splash is showing, the app tree still renders underneath (auth hydrates in background)

### 4. Cold-Start-Only Guard

The splash must NOT show on background resume. Implementation:

- Use a module-level `let splashShown = false` flag (persists across re-renders but resets on full page reload = cold start)
- On first mount: `splashShown = false` → show splash, set to `true`
- On resume (Capacitor `appStateChange`): `splashShown` is already `true` → skip
- This naturally handles: cold start (shows), force close + reopen (shows), background resume (skips)

### 5. Native Splash → Web Splash Handoff

Current `capacitor.config.ts` has `launchAutoHide: true` with 2s duration. We change to:

- `launchAutoHide: false` — web layer controls when to hide
- In `AppSplashScreen`, call `hideSplashScreen()` from `src/lib/capacitor.ts` as soon as the component mounts (the web splash takes over visually)
- The existing 4s hard timeout in `scheduleSplashTimeout()` remains as a safety net
- Background color `#1a1a2e` matches between native and web splash — seamless handoff

### 6. Prevent White Flash

- `index.html` `<body>` gets `style="background-color: #1a1a2e"` so even before React mounts, the background matches
- The splash component renders immediately (not lazy-loaded) — imported directly in `App.tsx`

## Files Changed

| File | Change |
|------|--------|
| `public/splash-video.mp4` | New — copy of uploaded video |
| `src/components/splash/AppSplashScreen.tsx` | New — video splash with readiness gate |
| `src/App.tsx` | Add splash state, render `AppSplashScreen` conditionally, pass `isSessionRestored` |
| `index.html` | Add `background-color: #1a1a2e` to body |
| `capacitor.config.ts` | Change `launchAutoHide: false` |

## Safety

- **No regressions**: Splash is a visual overlay only — does not block or delay auth, routing, or data fetching
- **No new dependencies**: Uses existing `framer-motion` + native `<video>` element
- **Fallback**: If video fails → static logo animation. If splash hangs → 3s hard cap exits. If native splash hangs → existing 4s timeout fires.
- **Performance**: Video autoplays muted (no user gesture needed). Component is eagerly imported (not lazy) to avoid loading delay.

