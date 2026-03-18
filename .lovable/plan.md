

## Fix: Remove class-level `@available` to unblock Capacitor plugin discovery

### Root Cause Confirmed
The plugin file **already has** `CAPBridgedPlugin` metadata (`identifier`, `jsName`, `pluginMethods`). The sole blocker is `@available(iOS 16.2, *)` on line 15, which hides the class from the ObjC runtime at Capacitor's plugin discovery time.

### Changes

#### 1. `native/ios/LiveActivityPlugin.swift`
- **Remove** `@available(iOS 16.2, *)` from line 15 (class level)
- **Wrap** all ActivityKit usage inside each method with `if #available(iOS 16.2, *)` guards
- **Add** `override public func load()` with a print statement for runtime verification
- The `import ActivityKit` stays -- it compiles fine without the class-level guard; only the API calls need runtime checks

#### 2. No other file changes needed
- Widget file (`LiveDeliveryWidget.swift`) runs in its own extension process -- its `@available` does not affect plugin discovery
- CI script (`codemagic.yaml`) correctly copies files and adds them to the build target
- JS plugin registration and `LiveActivityManager` are already correct

### After deployment
The `/la-debug` page should show:
- Plugin Available: **yes**
- START operations: **success** (on iOS 16.2+ real devices)
- Native Activities: **> 0**

