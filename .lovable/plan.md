

## Root Cause Found

The `SocivaBridgeViewController` approach is correct in theory, but it depends on a fragile `sed` replacement in `Main.storyboard`:

```bash
sed -i '' 's/customClass="CAPBridgeViewController"/customClass="SocivaBridgeViewController"/g' "$STORYBOARD"
```

**If Capacitor 8's generated storyboard does not contain the exact string `customClass="CAPBridgeViewController"`** (e.g., it uses no customClass at all, or a different format), the `sed` silently does nothing. The app continues using the default `CAPBridgeViewController`, `SocivaBridgeViewController` is never instantiated, and `registerPluginInstance` never runs.

Your Codemagic logs confirmed the plugin files copy succeeded, but you did not share the storyboard patch output -- it likely printed `"⚠️ Main.storyboard not found"` or the sed matched nothing.

---

## Fix: Guaranteed Registration via AppDelegate (No Storyboard Dependency)

### Changes to `codemagic.yaml`

#### 1. `ios-release` workflow -- Patch AppDelegate step (lines 123-173)

Add notification-based plugin registration directly inside `AppDelegate.swift` so it works regardless of storyboard:

```swift
import UIKit
import Capacitor
import FirebaseCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        
        // Register app-local plugins after Capacitor bridge loads
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(capacitorBridgeDidLoad(_:)),
            name: NSNotification.Name("CAPBridgeViewControllerDidLoad"),  // or .capacitorDidLoad
            object: nil
        )
        
        return true
    }
    
    @objc func capacitorBridgeDidLoad(_ notification: Notification) {
        guard let bridge = notification.object as? CAPBridge else {
            print("⚠️ capacitorBridgeDidLoad: notification.object is not CAPBridge")
            return
        }
        bridge.registerPluginInstance(LiveActivityPlugin())
        print("✅ LiveActivityPlugin REGISTERED via AppDelegate notification")
    }
    
    // ... existing URL handling, APNs forwarding unchanged
}
```

**Keep the SocivaBridgeViewController + storyboard patch as secondary insurance**, but the AppDelegate notification is the primary guaranteed path.

#### 2. Add storyboard verification step

After the storyboard patch, add a diagnostic step:

```bash
echo "=== Storyboard contents after patch ==="
cat "$STORYBOARD" 2>/dev/null || echo "File not found"
grep -o 'customClass="[^"]*"' "$STORYBOARD" 2>/dev/null || echo "No customClass found in storyboard"
```

This will show in Codemagic logs whether the storyboard patch actually matched.

#### 3. Fix `release-all` workflow (lines 834-881)

The `release-all` workflow's "Patch AppDelegate" step is **missing the SocivaBridgeViewController and notification registration entirely**. Add the same AppDelegate notification registration there too.

#### 4. Add build verification step

Add a step before `Build iOS app` that confirms the plugin will be discoverable:

```bash
# Verify LiveActivityPlugin registration is in the binary
grep -q "registerPluginInstance" ios/App/App/AppDelegate.swift && echo "✅ Plugin registration in AppDelegate" || echo "❌ MISSING plugin registration"
grep -q "registerPluginInstance" ios/App/App/SocivaBridgeViewController.swift && echo "✅ Plugin registration in BridgeVC" || echo "❌ MISSING BridgeVC registration"
```

---

## Why This Works

- `NotificationCenter` does not depend on storyboard class names
- It fires when `CAPBridgeViewController.viewDidLoad()` runs, regardless of whether the VC is the default or a subclass
- The plugin instance is registered directly on the bridge object
- Works in both `ios-release` and `release-all` workflows

## Expected Result

After one more Codemagic build:
- Device logs show: `✅ LiveActivityPlugin REGISTERED via AppDelegate notification`
- `/la-debug` shows: Plugin Available ✅, getActivities Works ✅

