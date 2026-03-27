

# Fix: LaunchScreen.storyboard Heredoc Indentation

## Root Cause

The `codemagic.yaml` heredoc at line 210 uses `<< 'STORYBOARDXML'` (plain heredoc), but every XML line is indented with ~10 spaces for YAML readability. This means the generated `LaunchScreen.storyboard` file starts with spaces before `<?xml version="1.0"...`, which is **invalid XML**. The XML declaration must be at byte 0 of the file.

Xcode 26.2 rejects this malformed XML during `CompileStoryboard`.

## Fix

Change the heredoc from `<< 'STORYBOARDXML'` to `<<- 'STORYBOARDXML'` **and** convert the indentation from spaces to tabs. The `<<-` operator strips leading **tabs** (not spaces) from heredoc content.

Alternatively (simpler, more reliable): remove all leading whitespace from the storyboard XML lines so they start at column 0 inside the heredoc. This is the safest approach since YAML multi-line strings handle this fine as long as the heredoc delimiter is at the correct indentation level.

### Concrete change in `codemagic.yaml` (lines 210-247)

Replace the indented XML block with unindented XML:

```yaml
            cat > "$STORYBOARD" << 'STORYBOARDXML'
<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="32106" targetRuntime="AppleSDK" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
  <device id="retina6_12" orientation="portrait" appearance="light"/>
  <scenes>
    <scene sceneID="EHf-IW-A2E">
      <objects>
        <viewController id="01J-lp-oVM" sceneMemberID="viewController">
          <view key="view" contentMode="scaleToFill" id="GJd-Yh-RWb">
            <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
            <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
            <subviews>
              <imageView clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" image="SplashLogo" translatesAutoresizingMaskIntoConstraints="NO" id="splashLogoView">
                <rect key="frame" x="96.5" y="376" width="200" height="100"/>
                <constraints>
                  <constraint firstAttribute="width" constant="200" id="splashW"/>
                  <constraint firstAttribute="height" constant="100" id="splashH"/>
                </constraints>
              </imageView>
            </subviews>
            <color key="backgroundColor" red="0.10196078431372549" green="0.10196078431372549" blue="0.18039215686274512" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
            <constraints>
              <constraint firstItem="splashLogoView" firstAttribute="centerX" secondItem="GJd-Yh-RWb" secondAttribute="centerX" id="splashCX"/>
              <constraint firstItem="splashLogoView" firstAttribute="centerY" secondItem="GJd-Yh-RWb" secondAttribute="centerY" id="splashCY"/>
            </constraints>
            <viewLayoutGuide key="safeArea" id="Bcu-3y-fUS"/>
          </view>
        </viewController>
        <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
      </objects>
      <point key="canvasLocation" x="52.173913043478265" y="375"/>
    </scene>
  </scenes>
  <resources>
    <image name="SplashLogo" width="341" height="171"/>
  </resources>
</document>
STORYBOARDXML
```

All XML lines now start at column 0 (no leading spaces). The heredoc delimiter `STORYBOARDXML` is also at column 0. The `cat >` command line itself remains indented for YAML — that's fine since it's a shell command, not heredoc content.

## File Changed

| File | Lines | Change |
|------|-------|--------|
| `codemagic.yaml` | 210-247 | Remove leading whitespace from all storyboard XML lines inside heredoc |

## Risk

Zero — only affects the generated launch screen file during Codemagic builds. No app logic change.

