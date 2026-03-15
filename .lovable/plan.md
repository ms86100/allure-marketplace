

# Phase I Live Activities — Production Readiness Audit

## iOS Production Requirements

| Requirement | Status | Evidence |
|---|---|---|
| Deployment target ≥ 16.1 | **NOT CONFIGURED** | No iOS project exists yet (`ios/` directory absent). `@available(iOS 16.1, *)` guards exist in Swift files but deployment target is set during Xcode project creation |
| ActivityKit imported | **Present (reference)** | `native/ios/LiveActivityPlugin.swift` L12, `LiveDeliveryActivity.swift` L11, `LiveDeliveryWidget.swift` L12 — all `import ActivityKit` |
| Widget extension target | **MISSING** | No Xcode project exists. Widget extension must be manually created in Xcode (separate target with its own bundle ID, e.g. `app.sociva.community.LiveDeliveryWidget`) |
| Live Activities capability | **MISSING** | No `.entitlements` file in repository. `com.apple.developer.activitykit` must be added manually in Xcode Signing & Capabilities |
| Widget extension bundle ID | **MISSING** | Must be created during Xcode widget target setup |
| Widget included in main app | **MISSING** | Requires Xcode project — embed widget extension in main app target |

## Android Production Requirements

| Requirement | Status | Evidence |
|---|---|---|
| `FOREGROUND_SERVICE` permission | **MISSING** | No `AndroidManifest.xml` in repository. Zero search results for `FOREGROUND_SERVICE` across all files |
| `POST_NOTIFICATIONS` permission | **MISSING** | No manifest exists |
| `LiveDeliveryService` declared in manifest | **MISSING** | No manifest XML references `LiveDeliveryService` |
| Foreground service type defined | **MISSING** | Requires `android:foregroundServiceType` attribute on service declaration |
| Notification channel created | **Present (code)** | `LiveDeliveryService.kt` L88-97: `createNotificationChannel()` with `CHANNEL_ID = "sociva_live_delivery"` |
| `startForeground()` called | **Present (code)** | `LiveDeliveryService.kt` L50: `startForeground(NOTIFICATION_ID, notification)` |

## Capacitor Integration

| Requirement | Status | Evidence |
|---|---|---|
| Plugin in `capacitor.config.ts` | **Not listed** | Config L46-66 lists SplashScreen, StatusBar, PushNotifications, Keyboard — no LiveActivity. However, Capacitor native plugins registered via `@CapacitorPlugin` annotation are auto-discovered, so this is acceptable |
| Plugin registered in native code | **Present (reference)** | Android: `@CapacitorPlugin(name = "LiveActivity")` in `LiveActivityPlugin.kt`. iOS: `@objc(LiveActivityPlugin)` with `jsName = "LiveActivity"` in `LiveActivityPlugin.swift` |
| Native files copied into platform projects | **NOT YET** | Files live in `native/ios/` and `native/android/` — must be manually copied after `npx cap add ios/android` |

## Runtime Call Chain (Verified in TypeScript)

```text
Order status change (e.g. "accepted")
  → OrderDetailPage.tsx passes status to useLiveActivity hook
    → useLiveActivity constructs LiveActivityData, calls LiveActivityManager.push()
      → push() checks TERMINAL_STATUSES / START_STATUSES
        → Calls LiveActivity.startLiveActivity() (or updateLiveActivity / endLiveActivity)
          → On native: bridges to Swift/Kotlin plugin
          → On web: silent no-op
```

Chain is complete in TypeScript. Native execution depends on configuration below.

## Final Verdict

| Layer | Status |
|---|---|
| TypeScript integration | **Production Ready** |
| iOS native code | **Code Complete, Config Missing** |
| iOS configuration | **Not Ready** — no widget extension target, no entitlements, no deployment target set |
| Android native code | **Code Complete, Config Missing** |
| Android configuration | **Not Ready** — no manifest permissions, no service declaration |

## Remaining Steps Before Release

### iOS (must be done in Xcode after `npx cap add ios`)

1. Copy `native/ios/*.swift` files into the Xcode project
2. Set deployment target to **iOS 16.1** minimum
3. Create a **Widget Extension** target (bundle ID: `app.sociva.community.LiveDeliveryWidget`)
4. Move `LiveDeliveryWidget.swift` and `LiveDeliveryActivity.swift` into the widget extension target
5. Add `LiveDeliveryActivity.swift` to **both** the main app target and widget extension target (shared model)
6. Enable **Live Activities** capability in Signing & Capabilities (adds `com.apple.developer.activitykit` entitlement)
7. Register the plugin in the bridge: `bridge.registerPlugin(LiveActivityPlugin.self)`

### Android (must be done in Android Studio after `npx cap add android`)

1. Copy `native/android/*.kt` files into `android/app/src/main/java/app/sociva/community/`
2. Add to `AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
   ```
3. Declare the service in `AndroidManifest.xml`:
   ```xml
   <service
       android:name=".LiveDeliveryService"
       android:foregroundServiceType="specialUse"
       android:exported="false" />
   ```
4. Register the plugin in `MainActivity`: `registerPlugin(LiveActivityPlugin::class.java)`

### Conclusion

Phase I Live Activities is **code-complete but not production-ready**. The TypeScript layer and native reference code are fully implemented. However, all native platform configuration (manifest permissions, widget extension, entitlements) must be completed manually in Xcode and Android Studio after exporting the project. These are standard Capacitor native setup steps that cannot be performed within Lovable's web environment.

