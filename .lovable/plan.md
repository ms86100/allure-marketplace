

## Root Cause: Capacitor 8 does not auto-discover app-local Swift plugins

The CI logs confirm the files are copied and added to Compile Sources. The build succeeds. The plugin class is correctly structured. **The problem is not file inclusion -- it is plugin discovery.**

### Why auto-discovery fails

This project uses **Capacitor 8** (line 68 of `codemagic.yaml`: "Capacitor 8 requires iOS 16.0 minimum"). Starting from Capacitor 6+, plugin discovery changed: plugins are enumerated from **CocoaPods/SPM package metadata**, not by ObjC runtime class scanning. App-local Swift files compiled directly into the App target are **invisible** to this mechanism even though they compile successfully.

The CocoaPods plugin list (line 79-91) includes `CapacitorApp`, `CapacitorCamera`, etc. -- but `LiveActivityPlugin` is not a pod. It's a loose Swift file. Capacitor 8 simply never looks for it.

### The fix: Explicit bridge registration

Register the plugin instance after the Capacitor bridge loads. This is the correct Capacitor 6+ pattern for app-local plugins.

### Changes

#### 1. `codemagic.yaml` -- Patch AppDelegate step (line 123)

Update the existing AppDelegate template to include a `viewDidLoad` hook or use the Capacitor notification to register the plugin after the bridge initializes:

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
        
        // Register app-local plugins after bridge loads
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(registerLocalPlugins(_:)),
            name: NSNotification.Name.capacitorDidLoad,  // or equivalent
            object: nil
        )
        
        return true
    }
    
    @objc func registerLocalPlugins(_ notification: Notification) {
        guard let bridge = notification.object as? CAPBridge else { return }
        bridge.registerPluginInstance(LiveActivityPlugin())
    }
    
    // ... existing URL handling, APNs forwarding stays the same
}
```

**Alternative (simpler, no notification):** If `CAPBridgeViewController` is the root, subclass it:

```swift
class SocivaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
```

Then point `Main.storyboard` to this subclass. Both approaches achieve the same result -- I will verify which one Capacitor 8 supports and implement accordingly.

#### 2. No changes to `LiveActivityPlugin.swift`

The plugin source is correct as-is.

#### 3. No ObjC shim needed

This is pure Swift registration through Capacitor's supported API.

### Why this is different from the previously rejected ObjC shim

The ObjC `.m` shim was a Capacitor 4-era workaround using `CAP_PLUGIN` macros. This fix uses Capacitor's own `registerPluginInstance()` API -- the documented mechanism for app-local plugins in Capacitor 6+.

### Expected result

After one more Codemagic build with this change:
- `✅ LiveActivityPlugin loaded` appears in device logs
- `/la-debug` shows Plugin Available: yes
- Start Test returns an activityId or a real ActivityKit error

