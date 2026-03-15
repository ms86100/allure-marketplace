

# Add Live Activities to Codemagic iOS Build Pipeline

## What We're Doing

Adding CI build steps to the existing `codemagic.yaml` so that Live Activities (lock screen + Dynamic Island) are automatically compiled and included in the TestFlight build — no Xcode required.

## Current State

- `codemagic.yaml` already has a working `ios-release` workflow (L10-329)
- Native Swift files exist in `native/ios/` (3 files)
- Deployment target is currently set to `16.0` (L268) — needs `16.1` for ActivityKit
- Entitlements file exists (L178-191) but lacks `com.apple.developer.activitykit`
- No step copies native plugin files into `ios/App/App/`
- No Widget Extension target is created

## Plan

### 1. Update `codemagic.yaml` — Insert new build steps into `ios-release` workflow

Insert **after** the "Copy custom notification sound" step (L251) and **before** "Update iOS project settings" (L263):

**Step A: Copy Live Activity plugin files**
```bash
cp native/ios/LiveActivityPlugin.swift ios/App/App/
cp native/ios/LiveDeliveryActivity.swift ios/App/App/
```
Uses Ruby/xcodeproj to add them to the App target so they compile.

**Step B: Create Widget Extension target programmatically**
Uses Ruby `xcodeproj` gem (already available on Codemagic) to:
- Create a new native target `LiveDeliveryWidgetExtension` (type: app_extension)
- Set bundle ID to `app.sociva.community.LiveDeliveryWidget`
- Add `LiveDeliveryWidget.swift` and `LiveDeliveryActivity.swift` to it
- Set deployment target to 16.1
- Embed the extension in the main App target
- Create a widget extension `Info.plist` with `NSExtension` keys

**Step C: Add ActivityKit entitlement**
Adds `com.apple.developer.activitykit` to the existing `App.entitlements` and creates a separate entitlements file for the widget extension.

### 2. Update deployment target from 16.0 → 16.1

Modify the existing "Update iOS project settings" step (L268) to use `16.1`.

### 3. Update code signing step

Add the widget extension bundle ID to the signing fetch:
```bash
app-store-connect fetch-signing-files "app.sociva.community.LiveDeliveryWidget" \
  --type IOS_APP_STORE --create
```

### 4. Update Podfile generation

Add the `LiveDeliveryActivity.swift` shared model to the widget extension target in the Podfile so it compiles correctly.

### 5. Register LiveActivity plugin in AppDelegate

Add `import ActivityKit` and plugin registration to the patched `AppDelegate.swift`.

## Files Modified

- `codemagic.yaml` — Add 4 new build steps, modify 3 existing steps

## Technical Details

The Widget Extension is the critical piece. On Codemagic, we use the `xcodeproj` Ruby gem to programmatically create a widget extension target, which is equivalent to doing "File → New → Target → Widget Extension" in Xcode. This avoids needing any manual Xcode setup.

