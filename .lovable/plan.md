

## Fix: Remove `com.apple.developer.activitykit` from entitlements files

### Root cause (confirmed via Apple Developer Forums)

`com.apple.developer.activitykit` is **not a real provisioning profile entitlement**. Apple does not list it as a capability in the Developer Portal, and it cannot be included in any provisioning profile. When Xcode sees it in an `.entitlements` file, it tries to match it against the profile, fails, and produces the exact error you are seeing.

Live Activities are enabled solely through `NSSupportsLiveActivities = YES` in `Info.plist` (which your pipeline already sets). No entitlements key is required.

This is the same issue described in [this Apple Developer Forums thread](https://developer.apple.com/forums/thread/808712) — the fix is to remove the entitlement key from both `.entitlements` files.

### Changes to `codemagic.yaml`

**Both `ios-release` and `release-all` workflows:**

1. **Remove `com.apple.developer.activitykit` from `App/App.entitlements`** (lines ~194-195 and ~850-851)
   - Keep `aps-environment` and `associated-domains` — only remove the activitykit key

2. **Remove `com.apple.developer.activitykit` from `LiveDeliveryWidgetExtension.entitlements`** (lines ~348-349 and ~992-993)
   - The widget entitlements file becomes an empty dict (or can be omitted entirely)

3. **Remove the "Verify ActivityKit entitlement exists" steps** (lines ~560-568 and ~1201-1206)
   - These checks are now invalid since the entitlement is intentionally removed

4. **Keep `NSSupportsLiveActivities = YES` in Info.plist** — this is the correct mechanism and is already present

### What stays the same
- Widget extension target creation (Ruby xcodeproj scripts)
- All Swift source files (LiveDeliveryWidget.swift, LiveDeliveryActivity.swift, LiveActivityPlugin.swift)
- `NSSupportsLiveActivities` in Info.plist
- Push notification entitlements (`aps-environment`)
- Signing flow (`xcode-project use-profiles`)
- All preflight checks except the removed activitykit verification

### Expected result
The archive should pass the signing/entitlement validation stage and proceed to compilation. If there are further Swift compilation errors in the widget target, those will now surface clearly instead of being masked by the entitlement failure.

