

## Brand the Dynamic Island with Sociva Icon

### Problem
The Dynamic Island currently shows `Image(systemName: "bag.fill")` — a generic SF Symbol. iOS renders this as an orange bag placeholder because no custom app icon is provided to the widget extension. Blinkit and other apps inject their own brand icon, making the activity immediately recognizable.

### Root Cause
1. `LiveDeliveryWidget.swift` uses `Image(systemName: "bag.fill")` in `compactLeading` and `minimal` — these are system icons, not Sociva branding
2. The widget extension has **no Assets.xcassets** — so even if we referenced `Image("SocivaIcon")`, there'd be no image to load
3. The CI script (`codemagic.yaml`) never creates an asset catalog for the widget extension

### Plan

#### 1. Create a widget icon asset in the repo

Add a small (40x40 @2x and @3x) Sociva icon PNG at:
- `native/ios/Assets/SocivaIcon@2x.png` (80x80px)
- `native/ios/Assets/SocivaIcon@3x.png` (120x120px)

These will be generated from the existing `public/app-icon-1024x1024.png` during CI using `sips` (macOS built-in image tool).

#### 2. Update `codemagic.yaml` — create Assets.xcassets for widget extension

In **both** "Create Live Activity Widget Extension" steps (lines ~345 and ~1045), add after the Swift file copy:

```bash
# Create widget Assets.xcassets with Sociva icon
mkdir -p LiveDeliveryWidgetExtension/Assets.xcassets/SocivaIcon.imageset
sips -z 80 80 ../../public/app-icon-1024x1024.png --out LiveDeliveryWidgetExtension/Assets.xcassets/SocivaIcon.imageset/SocivaIcon@2x.png
sips -z 120 120 ../../public/app-icon-1024x1024.png --out LiveDeliveryWidgetExtension/Assets.xcassets/SocivaIcon.imageset/SocivaIcon@3x.png

cat > LiveDeliveryWidgetExtension/Assets.xcassets/Contents.json << 'JSON'
{"info":{"version":1,"author":"xcode"}}
JSON

cat > LiveDeliveryWidgetExtension/Assets.xcassets/SocivaIcon.imageset/Contents.json << 'JSON'
{
  "images": [
    {"idiom":"universal","scale":"2x","filename":"SocivaIcon@2x.png"},
    {"idiom":"universal","scale":"3x","filename":"SocivaIcon@3x.png"}
  ],
  "info":{"version":1,"author":"xcode"}
}
JSON
```

In the Ruby xcodeproj script, add the asset catalog to the widget target's resources build phase:

```ruby
# Add Assets.xcassets to widget target
assets_ref = widget_group.files.find { |f| f.path == 'Assets.xcassets' } || widget_group.new_file('Assets.xcassets')
unless widget_target.resources_build_phase.files_references.any? { |f| f.path == 'Assets.xcassets' }
  widget_target.resources_build_phase.add_file_reference(assets_ref, true)
end
```

Also add build setting:
```ruby
settings['ASSETCATALOG_COMPILER_GENERATE_ASSET_SYMBOLS'] = 'YES'
```

#### 3. Update `LiveDeliveryWidget.swift`

Replace the SF Symbol references with the custom Sociva icon:

```swift
} compactLeading: {
    Image("SocivaIcon")
        .resizable()
        .scaledToFit()
        .frame(width: 20, height: 20)
        .clipShape(Circle())
} compactTrailing: {
    if let eta = context.state.etaMinutes {
        Text("\(eta)m")
            .font(.caption)
            .bold()
    }
} minimal: {
    Image("SocivaIcon")
        .resizable()
        .scaledToFit()
        .clipShape(Circle())
}
```

Also improve the expanded Dynamic Island leading region:
```swift
DynamicIslandExpandedRegion(.leading) {
    HStack(spacing: 4) {
        Image("SocivaIcon")
            .resizable()
            .scaledToFit()
            .frame(width: 24, height: 24)
            .clipShape(Circle())
        Text(context.state.driverName ?? "Sociva")
            .font(.caption)
    }
}
```

### Files Changed

| File | Change |
|------|--------|
| `native/ios/LiveDeliveryWidget.swift` | Replace `Image(systemName: "bag.fill")` with `Image("SocivaIcon")` in compact, minimal, and expanded views |
| `codemagic.yaml` | Add Assets.xcassets creation with resized icon in both `ios-release` and `release-all` widget extension steps; add asset catalog to Xcode project via Ruby script |

