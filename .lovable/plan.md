

# Fix Splash / Launch Screen to Match New SOCIVA App Icon

## Problem

Three things are inconsistent:

1. **Capacitor splash config** in `capacitor.config.ts` has `backgroundColor: '#ffffff'` (white) — should be dark navy `#1a1a2e`
2. **`public/splash-screen.png`** is an old asset — never regenerated when the icon changed
3. **iOS LaunchScreen.storyboard** is never patched in `codemagic.yaml` — it uses Capacitor's default white screen with no icon, which is what users see during app cold start before the WebView loads

Apple requires visual consistency between app icon and launch screen. The current white splash vs dark navy icon will trigger rejection.

## Fix (3 changes)

### 1. Update `capacitor.config.ts` splash background
Change `backgroundColor: '#ffffff'` → `backgroundColor: '#1a1a2e'` to match the icon's dark navy.

### 2. Regenerate `public/splash-screen.png`
Create a 2732×2732 PNG (largest iPad splash dimension, works for all devices) with:
- Solid `#1a1a2e` background (no alpha)
- Centered SOCIVA wordmark from the SVG, rendered at ~40% width

### 3. Add LaunchScreen storyboard patch in `codemagic.yaml`
After the "Generate App Icon from source" step, add a new step that:
- Copies `splash-screen.png` into the iOS asset catalog as `LaunchImage`
- Patches `LaunchScreen.storyboard` to use the dark navy background color and display the centered SOCIVA image
- This replaces Capacitor's default white LaunchScreen

## Files

| File | Change |
|------|--------|
| `capacitor.config.ts` | Change splash `backgroundColor` to `#1a1a2e` |
| `public/splash-screen.png` | Regenerate with dark navy + SOCIVA wordmark |
| `codemagic.yaml` | Add step after icon generation to patch LaunchScreen storyboard |

