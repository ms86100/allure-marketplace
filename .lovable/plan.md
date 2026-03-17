

# Simplify Widget Extension Signing — Remove Manual Profile Parsing

## Problem

The `xcode-project use-profiles` command should automatically assign provisioning profiles to the widget target. The manual profile-parsing steps (lines 493-541 in `ios-release`, lines 1134-1182 in `release-all`) are brittle and unnecessary. The widget target already has the correct signing settings (`CODE_SIGN_STYLE = Manual`, `DEVELOPMENT_TEAM`, `CODE_SIGN_IDENTITY`, `PRODUCT_BUNDLE_IDENTIFIER`), so `use-profiles` should match them automatically.

The manual parsing may actually be interfering — or at minimum adding fragile complexity for no benefit.

## Changes to `codemagic.yaml`

### 1. Remove "Force-assign widget provisioning profile" step from `ios-release`
Delete lines 493-541 entirely (the step that parses `.mobileprovision` files with `security cms`).

### 2. Remove "Force-assign widget provisioning profile (release-all)" step from `release-all`
Delete lines 1134-1182 entirely (same manual parsing logic).

### 3. Add debug logging after `use-profiles`
In both workflows, add a small verification step after `xcode-project use-profiles` that prints the widget target's signing settings — so if the build still fails, we'll see exactly what `use-profiles` assigned:

```bash
- name: Verify widget signing settings
  script: |
    cd ios/App
    ruby - << 'RUBY'
    require 'xcodeproj'
    project = Xcodeproj::Project.open('App.xcodeproj')
    widget = project.targets.find { |t| t.name == 'LiveDeliveryWidgetExtension' }
    abort('Widget target not found') unless widget
    widget.build_configurations.each do |config|
      s = config.build_settings
      puts "=== #{config.name} ==="
      puts "  BUNDLE_ID: #{s['PRODUCT_BUNDLE_IDENTIFIER']}"
      puts "  TEAM: #{s['DEVELOPMENT_TEAM']}"
      puts "  SIGN_STYLE: #{s['CODE_SIGN_STYLE']}"
      puts "  SIGN_IDENTITY: #{s['CODE_SIGN_IDENTITY']}"
      puts "  PROFILE_SPECIFIER: #{s['PROVISIONING_PROFILE_SPECIFIER']}"
      puts "  PROFILE: #{s['PROVISIONING_PROFILE']}"
    end
    RUBY
```

This gives us diagnostic output without modifying anything.

## Summary

- Delete 2 "Force-assign" steps (manual `.mobileprovision` parsing)
- Add 2 lightweight "Verify widget signing settings" steps (read-only diagnostics)
- No other changes — the signing settings on the target are already correct

