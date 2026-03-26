

# Fix: Apple Rejection — Placeholder App Icon (Guideline 2.3.8)

## Root Cause

The Codemagic build pipeline runs `npx cap sync ios` which creates the default Capacitor placeholder AppIcon. The pipeline never replaces it with the actual Sociva icon from `public/app-icon-1024x1024.png`. Apple's reviewer saw the Capacitor default icon and rejected for "placeholder icons."

## Fix

Add a new build step in `codemagic.yaml` — immediately after `cap sync ios` in both the `ios-release` and `release-all` workflows — that generates the full `AppIcon.appiconset` from the existing `public/app-icon-1024x1024.png`.

### New Step: "Generate App Icon from source"

Insert after the `cap sync ios` + SPM cleanup step (after line 66 for `ios-release`, after line 855 for `release-all`):

```yaml
- name: Generate App Icon
  script: |
    ICON_SRC="$(pwd)/public/app-icon-1024x1024.png"
    ICON_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"
    rm -rf "$ICON_DIR"
    mkdir -p "$ICON_DIR"

    # Generate all required sizes using sips
    sips -z 40 40 "$ICON_SRC" --out "$ICON_DIR/icon-20@2x.png"
    sips -z 60 60 "$ICON_SRC" --out "$ICON_DIR/icon-20@3x.png"
    sips -z 58 58 "$ICON_SRC" --out "$ICON_DIR/icon-29@2x.png"
    sips -z 87 87 "$ICON_SRC" --out "$ICON_DIR/icon-29@3x.png"
    sips -z 80 80 "$ICON_SRC" --out "$ICON_DIR/icon-40@2x.png"
    sips -z 120 120 "$ICON_SRC" --out "$ICON_DIR/icon-40@3x.png"
    sips -z 120 120 "$ICON_SRC" --out "$ICON_DIR/icon-60@2x.png"
    sips -z 180 180 "$ICON_SRC" --out "$ICON_DIR/icon-60@3x.png"
    sips -z 1024 1024 "$ICON_SRC" --out "$ICON_DIR/icon-1024.png"

    # Write Contents.json
    cat > "$ICON_DIR/Contents.json" << 'ICONJSON'
    {
      "images": [
        {"idiom":"iphone","scale":"2x","size":"20x20","filename":"icon-20@2x.png"},
        {"idiom":"iphone","scale":"3x","size":"20x20","filename":"icon-20@3x.png"},
        {"idiom":"iphone","scale":"2x","size":"29x29","filename":"icon-29@2x.png"},
        {"idiom":"iphone","scale":"3x","size":"29x29","filename":"icon-29@3x.png"},
        {"idiom":"iphone","scale":"2x","size":"40x40","filename":"icon-40@2x.png"},
        {"idiom":"iphone","scale":"3x","size":"40x40","filename":"icon-40@3x.png"},
        {"idiom":"iphone","scale":"2x","size":"60x60","filename":"icon-60@2x.png"},
        {"idiom":"iphone","scale":"3x","size":"60x60","filename":"icon-60@3x.png"},
        {"idiom":"ios-marketing","scale":"1x","size":"1024x1024","filename":"icon-1024.png"}
      ],
      "info":{"version":1,"author":"xcode"}
    }
    ICONJSON
```

### Files Changed

| File | Change |
|------|--------|
| `codemagic.yaml` | Add "Generate App Icon" step in **two places**: after line ~66 (`ios-release`) and after line ~855 (`release-all`) |

### Impact Analysis

- **Zero risk** — this only replaces image files in the build output. No code changes, no dependency changes.
- The source icon `public/app-icon-1024x1024.png` already exists in the repo.
- The widget extension icon (SocivaIcon) is already handled separately and is unaffected.

