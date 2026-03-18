

## Build Failure Analysis

**Error** (line 455 of build log):
```
value of type 'CAPBridge' has no member 'registerPluginInstance'
```

**Root cause**: `AppDelegate.swift` casts `notification.object as? CAPBridge` and calls `registerPluginInstance()` on it. But `registerPluginInstance` is a method on `CAPBridgeProtocol` (the `bridge?` property inside `CAPBridgeViewController`), not on the `CAPBridge` class. This is a compile-time type error.

The `SocivaBridgeViewController` code (`bridge?.registerPluginInstance(LiveActivityPlugin())`) is actually correct because `bridge` there is `CAPBridgeProtocol?` which has that method. But the storyboard `sed` only replaces `customClass` without also replacing `customModule="Capacitor"` to `customModule="App"`, so the subclass is never used at runtime.

## Fix (Two Changes)

### 1. Remove ALL notification-based registration from AppDelegate

In both `ios-release` (lines 139-168) and `release-all` (lines 890-918) workflows, remove the `NotificationCenter` observer and `capacitorBridgeDidLoad` method entirely from the generated `AppDelegate.swift`. AppDelegate should only have Firebase config + standard Capacitor delegate methods. No plugin registration code.

### 2. Fix storyboard `sed` to patch both `customClass` AND `customModule`

In both workflows, change:
```bash
sed -i '' 's/customClass="CAPBridgeViewController"/customClass="SocivaBridgeViewController"/g'
```
To:
```bash
sed -i '' 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="SocivaBridgeViewController" customModule="App"/g'
```

Also add a fallback that patches them separately in case the attributes appear in different order:
```bash
# If combined sed matched nothing, try separate replacements
if ! grep -q 'SocivaBridgeViewController' "$STORYBOARD"; then
  sed -i '' 's/customClass="CAPBridgeViewController"/customClass="SocivaBridgeViewController"/g' "$STORYBOARD"
  sed -i '' '/SocivaBridgeViewController/s/customModule="Capacitor"/customModule="App"/g' "$STORYBOARD"
fi
```

Add a mandatory verification:
```bash
grep -q 'SocivaBridgeViewController' "$STORYBOARD" && echo "✅ Storyboard patched" || { echo "❌ FATAL: Storyboard patch failed"; cat "$STORYBOARD"; exit 1; }
```

### Why This Works

- Removes the code that doesn't compile (`CAPBridge.registerPluginInstance`)
- `SocivaBridgeViewController.capacitorDidLoad()` uses `bridge?.registerPluginInstance()` which IS the correct Capacitor 6+ API (bridge is `CAPBridgeProtocol?`)
- Fixing `customModule="App"` ensures iOS instantiates the subclass from the App module, not from the Capacitor framework
- Build will succeed because no invalid API calls remain

### Files Changed

- `codemagic.yaml`: Both `ios-release` and `release-all` workflow AppDelegate + storyboard patch steps

