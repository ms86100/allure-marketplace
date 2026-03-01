

# Problem: Raw APNs Tokens Instead of FCM Tokens

The Codemagic pipeline copies `GoogleService-Info.plist` into the iOS directory, but **never installs the Firebase SDK**. Without `FirebaseMessaging` in the Podfile and `FirebaseApp.configure()` in `AppDelegate.swift`, Capacitor's `PushNotifications.register()` returns raw APNs hex tokens (e.g., `891FFF772D...`) instead of FCM registration tokens (e.g., `dXXXXX:APA91b...`).

The edge function sends via FCM HTTP v1 API, which requires FCM tokens. That is why FCM rejects with `INVALID_ARGUMENT` — the token format is wrong.

**This is NOT currently implemented.** The pipeline only copies the plist file but never integrates Firebase into the native build.

## Changes Required

### 1. Update `codemagic.yaml` — add Firebase SDK injection steps

In both the `ios-release` and `release-all` workflows, add two new script steps **after** "Copy Firebase config" and **before** "Update iOS project settings":

**Step A: Inject Firebase pods into Podfile**
```bash
cd ios/App
# Add Firebase pods if not already present
if ! grep -q "FirebaseMessaging" Podfile; then
  sed -i '' "/target 'App' do/a\\
  pod 'FirebaseMessaging'
" Podfile
  echo "✅ Added FirebaseMessaging pod to Podfile"
fi
pod install
```

**Step B: Inject `FirebaseApp.configure()` into AppDelegate.swift**
```bash
APPDELEGATE="ios/App/App/AppDelegate.swift"
# Add import Firebase at top
if ! grep -q "import Firebase" "$APPDELEGATE"; then
  sed -i '' '1s/^/import Firebase\n/' "$APPDELEGATE"
  echo "✅ Added 'import Firebase' to AppDelegate"
fi
# Add FirebaseApp.configure() in didFinishLaunching
if ! grep -q "FirebaseApp.configure" "$APPDELEGATE"; then
  sed -i '' '/func application.*didFinishLaunchingWithOptions/,/{/ {
    /^.*{$/a\
        FirebaseApp.configure()
  }' "$APPDELEGATE"
  echo "✅ Added FirebaseApp.configure() to AppDelegate"
fi
```

**Step C: Add GoogleService-Info.plist to Xcode build target**

The file is copied but not added to the Xcode project's build resources. Add a script step:
```bash
cd ios/App
# Add GoogleService-Info.plist to Xcode project resources if not already referenced
if ! grep -q "GoogleService-Info.plist" App.xcodeproj/project.pbxproj; then
  ruby -e "
    require 'xcodeproj'
    project = Xcodeproj::Project.open('App.xcodeproj')
    target = project.targets.first
    group = project.main_group.find_subpath('App', true)
    ref = group.new_file('../App/GoogleService-Info.plist')
    target.resources_build_phase.add_file_reference(ref)
    project.save
  "
  echo "✅ Added GoogleService-Info.plist to Xcode build target"
fi
```

### 2. Order of operations in the pipeline

The final script order for the iOS section should be:
1. Install dependencies
2. Build web app
3. Add iOS platform / cap sync
4. Patch AppDelegate for push forwarding methods (existing)
5. Add Privacy Manifest (existing)
6. Copy Firebase config (existing)
7. **NEW: Inject Firebase pods + pod install**
8. **NEW: Inject FirebaseApp.configure() into AppDelegate**
9. **NEW: Add GoogleService-Info.plist to Xcode target**
10. Update iOS project settings (existing)
11. Add iOS capabilities (existing)
12. ... rest unchanged

### What this fixes

Once Firebase SDK is integrated, `PushNotifications.register()` will return proper FCM tokens. The edge function will then successfully deliver push notifications via FCM HTTP v1 API.

No changes to the TypeScript code, edge functions, or database are needed. This is purely a native build configuration fix.

