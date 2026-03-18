

## Fix: Explicit UIWindow Creation in AppDelegate

### Problem
Lines 141-142 (and 853-854) use `window?.rootViewController = vc` — but `self.window` is `nil` at this point, so the optional chaining silently no-ops. iOS falls back to storyboard's `CAPBridgeViewController`, plugin never registers.

### Fix

Replace the window assignment block in **two locations**:

**Location 1 — `ios-release` workflow (lines 139-143):**
```swift
// Deterministic: create window + use custom bridge VC
let vc = SocivaBridgeViewController()
let win = UIWindow(frame: UIScreen.main.bounds)
win.rootViewController = vc
win.makeKeyAndVisible()
self.window = win
print("✅ rootViewController = \(type(of: self.window?.rootViewController))")
```

**Location 2 — `release-all` workflow (lines 851-855):**
Identical change.

### What this does
- Explicitly creates a `UIWindow` instead of relying on storyboard to populate `self.window`
- Guarantees `SocivaBridgeViewController` is root → `capacitorDidLoad()` fires → `LiveActivityPlugin` registers
- No other files change

