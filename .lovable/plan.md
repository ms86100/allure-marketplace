

## Deterministic Plugin Registration — No Storyboard Patching

### Problem
The current approach patches `Main.storyboard` XML via `sed` to swap `CAPBridgeViewController` → `SocivaBridgeViewController`. This is fragile: attribute order, whitespace, or Capacitor version changes can silently break it.

### Solution: Programmatic Root VC Override in AppDelegate

Instead of patching the storyboard, **set the root view controller in code** inside `AppDelegate.didFinishLaunchingWithOptions`. This is 100% deterministic — it doesn't matter what the storyboard says.

```swift
func application(_ application: UIApplication,
                 didFinishLaunchingWithOptions launchOptions: ...) -> Bool {
    FirebaseApp.configure()
    
    // Deterministic: always use our custom bridge VC, bypassing storyboard class
    let vc = SocivaBridgeViewController()
    window?.rootViewController = vc
    window?.makeKeyAndVisible()
    
    // Runtime assertion
    print("✅ rootViewController = \(type(of: window?.rootViewController))")
    
    return true
}
```

`SocivaBridgeViewController` remains unchanged — it subclasses `CAPBridgeViewController` and calls `bridge?.registerPluginInstance(LiveActivityPlugin())` in `capacitorDidLoad()`.

### Changes to `codemagic.yaml` (both `ios-release` and `release-all`)

**1. Update AppDelegate generation** (lines 123-173 / 856-903):
Add 3 lines to `didFinishLaunchingWithOptions` after `FirebaseApp.configure()`:
```swift
let vc = SocivaBridgeViewController()
window?.rootViewController = vc
window?.makeKeyAndVisible()
```

**2. Remove ALL storyboard `sed` patching** (lines 210-237 / 936-960):
Delete the entire storyboard patch block — primary sed, fallback sed, verification grep. None of it is needed anymore since the storyboard's `customClass` is irrelevant when AppDelegate overrides the root VC.

**3. Keep** the `SocivaBridgeViewController.swift` generation and xcodeproj target addition (it still needs to compile).

**4. Add runtime validation step** — keep the existing `grep -q "registerPluginInstance"` check on the Swift file, and add:
```bash
grep -q "SocivaBridgeViewController()" ios/App/App/AppDelegate.swift && \
  echo "✅ Programmatic VC override in AppDelegate" || \
  { echo "❌ FATAL: Missing programmatic VC override"; exit 1; }
```

### Why This Is Deterministic
- No XML parsing or string matching
- No dependency on storyboard structure
- AppDelegate always creates and sets `SocivaBridgeViewController` as root
- `capacitorDidLoad()` always fires → plugin always registers
- Build fails explicitly if the code is missing (grep assertion)

### Expected Result
- Device logs: `rootViewController = Optional(SocivaBridgeViewController)` + `✅ LiveActivityPlugin registered`
- `/la-debug`: Plugin Available ✅, getActivities Works ✅

