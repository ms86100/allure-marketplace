

# Fix: Blank Black Screen on TestFlight + Push Notification Issues

## Root Cause Analysis

After reading the full `codemagic.yaml` (749 lines), `vite.config.ts`, `capacitor.config.ts`, and `App.tsx`, I identified **three concrete issues** causing the blank black screen and broken push notifications.

---

### Issue 1: AppDelegate Missing Capacitor URL Proxy Methods (Crash → Black Screen)

The rewritten `AppDelegate.swift` (lines 57-97 and duplicated at 501-538) is missing the two `ApplicationDelegateProxy.shared` methods that Capacitor's default AppDelegate includes. These handle:
- Deep links (`sociva://...`)
- OAuth redirects (Supabase auth callbacks)
- Universal links

Without them, any URL event crashes the app. iOS may restart it in a loop, showing a black screen.

**Fix:** Add the two missing methods to the AppDelegate heredoc in all three workflow sections (`ios-release`, `release-all`):
```swift
func application(_ app: UIApplication, open url: URL,
                 options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
}

func application(_ application: UIApplication,
                 continue userActivity: NSUserActivity,
                 restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    return ApplicationDelegateProxy.shared.application(application,
                 continue: userActivity, restorationHandler: restorationHandler)
}
```

---

### Issue 2: Duplicate React Instances (Blank Render)

`vite.config.ts` line 63 has `dedupe: ["react", "react-dom"]` but is missing `"react/jsx-runtime"`. When `framer-motion` or other dependencies bundle their own JSX runtime, React hooks lose their dispatcher, causing a silent blank render.

**Fix:** Add `"react/jsx-runtime"` to the dedupe array in `vite.config.ts`:
```typescript
dedupe: ["react", "react-dom", "react/jsx-runtime"],
```

---

### Issue 3: Missing `cocoapods: default` in Codemagic Environment

The template yaml you uploaded has `cocoapods: default` in the environment section. Your project's `codemagic.yaml` does not. While Codemagic machines usually have CocoaPods pre-installed, omitting this can cause version mismatches or `pod install` failures.

**Fix:** Add `cocoapods: default` to all iOS workflow environment sections.

---

## Changes Summary

| File | Change |
|------|--------|
| `codemagic.yaml` | Add `ApplicationDelegateProxy` URL handlers to AppDelegate heredoc in `ios-release` and `release-all` workflows. Add `cocoapods: default` to environment sections. |
| `vite.config.ts` | Add `"react/jsx-runtime"` to `resolve.dedupe` array |

2 files changed. After rebuilding on Codemagic, the app should render correctly and push notification registration should proceed without crashes.

