

# Audit: Login Persistence & Haptic Feedback on Native (iOS/TestFlight)

Two user-reported issues on the native iOS build. Both are correctness bugs, not feature requests.

---

## Issue A — Login Session Not Persisted Across App Restarts (iOS)

**Scenario:** User installs via TestFlight, logs in, closes the app, reopens it — they are logged out.

**Root Cause:** The Supabase auth client is configured with `storage: localStorage` (in `src/integrations/supabase/client.ts`). On iOS, Capacitor apps run inside WKWebView. Apple treats WKWebView `localStorage` as **non-persistent** — the OS can (and does) purge it when the app is suspended, the device is low on storage, or after a period of inactivity. This means the auth session token stored in `localStorage` is silently deleted, causing the user to appear logged out on next launch.

**Proposed Fix:** Install `@capacitor/preferences` (which uses `UserDefaults` on iOS and `SharedPreferences` on Android — both fully persistent). Create a thin adapter that implements the Supabase `SupportedStorage` interface (`getItem`, `setItem`, `removeItem`) backed by the Preferences plugin. On web, fall back to `localStorage`. Pass this adapter as the `storage` option in the Supabase client constructor.

**Important constraint:** The `src/integrations/supabase/client.ts` file is auto-generated and must NOT be edited. Instead, the persistent storage adapter will be created in a separate file (`src/lib/capacitor-storage.ts`), and the Supabase client initialization will be wrapped in `src/lib/supabase-client-init.ts` which patches the auth storage at app startup before any auth calls are made. Alternatively, since the client file cannot be touched, the adapter can be applied at runtime via `supabase.auth.setSession()` pattern — but the cleanest approach is to create the storage adapter and configure it in a startup hook that runs before auth state is read.

**Correction:** After re-reading the constraint — we truly cannot edit `client.ts`. However, we CAN create a startup function in `src/lib/capacitor.ts` (which we control) that swaps the storage adapter on the existing client instance before auth kicks in. The Supabase JS v2 client exposes `supabase.auth` which internally references the storage. We can use `supabase.auth.storage` or reconfigure via the client's internal auth instance. The most reliable approach is:

1. Install `@capacitor/preferences`
2. Create `src/lib/capacitor-storage.ts` — a `SupportedStorage`-compatible adapter
3. In `src/lib/capacitor.ts` (`initializeCapacitorPlugins`), call a setup function that patches the supabase client's auth storage before `getSession()` is invoked
4. The auth state listener in `useAuthState.ts` runs inside `useEffect` (after mount), so the storage swap in `initializeCapacitorPlugins()` (called synchronously in `main.tsx`) will execute first

**Files changed:**
- `package.json` — add `@capacitor/preferences`
- New file: `src/lib/capacitor-storage.ts` — persistent storage adapter
- `src/lib/capacitor.ts` — call storage setup during initialization

---

## Issue B — Haptic Feedback Missing on BottomNav Tab Switches

**Scenario:** User taps bottom navigation tabs (Home → Cart, Categories → Profile, etc.) — no haptic feedback. Haptics work correctly inside the cart page (buttons, quantity controls).

**Root Cause:** The `GlobalHapticListener` in `src/components/haptics/GlobalHapticListener.tsx` attaches a `click` event listener in capture phase on `document`. The selector includes `a` tags, and `NavLink` renders as `<a>`. However, on iOS native (WKWebView), there is a known behavior where programmatic navigation via React Router's `NavLink` can suppress or delay the native DOM `click` event in certain timing scenarios. Additionally, when the user taps on the Lucide SVG icon inside the `<a>`, the `e.target` is an SVG element (`<svg>`, `<path>`, `<line>`). While `Element.prototype.closest()` does work on SVG elements in modern WebKit, the traversal from SVG child → SVG root → HTML parent can be unreliable in some WKWebView builds, causing `target.closest('a')` to return `null`.

The cart works because cart buttons are `<button>` elements with direct click handlers, and the haptic calls are made explicitly in component code (e.g., `useHaptics` hook calls in cart interaction handlers).

**Proposed Fix:** Add an explicit `onClick` handler to each `NavLink` in `BottomNav.tsx` that directly calls `hapticSelection()`. This is a one-line addition per NavLink (or a single wrapper callback) and does not change any navigation behavior or business logic. The `GlobalHapticListener` remains as a catch-all for other interactive elements.

**Files changed:**
- `src/components/layout/BottomNav.tsx` — import `hapticSelection` and call it in NavLink's `onClick`

---

## Implementation Details

### File 1: `src/lib/capacitor-storage.ts` (new)
Creates a class implementing `getItem(key)`, `setItem(key, value)`, `removeItem(key)` using `@capacitor/preferences` on native and `localStorage` on web. All methods are async (which Supabase auth supports).

### File 2: `src/lib/capacitor.ts` (edit)
Import the storage adapter. In `initializeCapacitorPlugins()`, before any other logic, reconfigure the supabase client's auth instance to use the persistent storage. Since `initializeCapacitorPlugins()` runs in `main.tsx` before `createRoot`, the storage is swapped before any React component reads auth state.

### File 3: `src/components/layout/BottomNav.tsx` (edit)
Add `import { hapticSelection } from '@/lib/haptics'` and add `onClick={() => hapticSelection()}` to the `NavLink` element. Since `hapticSelection` is a no-op on web and the module is pre-loaded at startup, there is zero overhead.

### File 4: `package.json` (edit)
Add `"@capacitor/preferences": "^8.0.0"` to dependencies.

---

## Risk Assessment
- **Login fix:** Zero risk to web users (falls back to `localStorage`). Native users get persistent sessions via OS-level storage. No business logic change.
- **Haptic fix:** Additive — explicit haptic call on tab tap. No navigation or rendering behavior changed. The `GlobalHapticListener` continues to work as a fallback for all other elements.

