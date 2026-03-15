

# Fix Widget Extension Provisioning Profile Assignment

## Root Cause

The `xcode-project use-profiles` command from Codemagic CLI tools is **not matching** the downloaded provisioning profile to the `LiveDeliveryWidgetExtension` target. This is likely because:

1. The `CODE_SIGN_IDENTITY` is only set with the conditional key `CODE_SIGN_IDENTITY[sdk=iphoneos*]`, but `use-profiles` may need the plain `CODE_SIGN_IDENTITY` key
2. There's no explicit `PROVISIONING_PROFILE_SPECIFIER` fallback if automatic matching fails

The duplicate `.appex` error is now gone (previous fix worked), but the signing issue persists.

## Fix — Two Changes in `codemagic.yaml`

### Change 1: Set plain `CODE_SIGN_IDENTITY` on widget target

In both Ruby blocks (lines 392-410 for `ios-release`, equivalent in `release-all`), add the plain key alongside the conditional one:

```ruby
settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
settings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
```

### Change 2: Add post-signing verification + manual profile assignment

After `xcode-project use-profiles` (line 489 and line 1078), add a new step that:

1. Finds the downloaded provisioning profile for the widget bundle ID
2. Explicitly sets `PROVISIONING_PROFILE_SPECIFIER` on the widget target if `use-profiles` didn't

```bash
# After use-profiles, force-assign widget profile
cd ios/App
ruby - << 'RUBY'
require 'xcodeproj'

project = Xcodeproj::Project.open('App.xcodeproj')
widget = project.targets.find { |t| t.name == 'LiveDeliveryWidgetExtension' }
abort('Widget target not found') unless widget

# Check if use-profiles already set a specifier
needs_fix = widget.build_configurations.any? do |config|
  s = config.build_settings
  s['PROVISIONING_PROFILE_SPECIFIER'].nil? || s['PROVISIONING_PROFILE_SPECIFIER'].empty?
end

if needs_fix
  # Find the profile from ~/Library/MobileDevice
  profiles_dir = File.expand_path('~/Library/MobileDevice/Provisioning Profiles')
  profile_files = Dir.glob("#{profiles_dir}/*.mobileprovision")
  
  widget_profile = profile_files.find do |f|
    content = File.read(f, encoding: 'binary')
    content.include?('app.sociva.community.LiveDeliveryWidget')
  end
  
  if widget_profile
    # Extract profile name using security cms
    profile_plist = `security cms -D -i "#{widget_profile}" 2>/dev/null`
    name_match = profile_plist.match(/<key>Name<\/key>\s*<string>([^<]+)<\/string>/)
    profile_name = name_match ? name_match[1] : nil
    
    uuid_match = profile_plist.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/)
    profile_uuid = uuid_match ? uuid_match[1] : nil
    
    if profile_name && profile_uuid
      widget.build_configurations.each do |config|
        config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = profile_name
        config.build_settings['PROVISIONING_PROFILE'] = profile_uuid
      end
      project.save
      puts "=== Manually assigned profile '#{profile_name}' (#{profile_uuid}) to widget ==="
    else
      abort('ERROR: Could not parse widget provisioning profile')
    end
  else
    abort("ERROR: No provisioning profile found for app.sociva.community.LiveDeliveryWidget in #{profiles_dir}")
  end
else
  puts '=== Widget already has provisioning profile assigned ==='
end
RUBY
```

### Files Modified

- `codemagic.yaml` — both `ios-release` and `release-all` workflows:
  - Add `CODE_SIGN_IDENTITY` (plain key) to widget build settings
  - Add new step after signing to force-assign provisioning profile to widget target

