

# Fix Codemagic Build: Duplicate Widget Extension Target

## Problem

The Ruby script in both `ios-release` and `release-all` workflows always calls `project.new_target(:app_extension, 'LiveDeliveryWidgetExtension', ...)` without checking if the target already exists. This creates a duplicate target, and both produce the same `.appex` output — causing the Xcode error:

```
Multiple commands produce '.appex'
```

## Fix

Add an `existing` guard in the Ruby block of both workflows. If a target named `LiveDeliveryWidgetExtension` already exists, skip creation and reuse it.

### Changes to `codemagic.yaml`

**Workflow 1: `ios-release`** (lines 355-412)

Replace the Ruby block so it checks for an existing target first:

```ruby
existing = project.targets.find { |t| t.name == 'LiveDeliveryWidgetExtension' }
if existing
  puts "=== LiveDeliveryWidgetExtension already exists, skipping creation ==="
else
  widget_target = project.new_target(...)
  # ... rest of setup ...
end
```

**Workflow 2: `release-all`** (lines 898-945)

Same guard added to the identical Ruby block.

### Files Modified
- `codemagic.yaml` — add duplicate-target guard in both workflow Ruby scripts

### What You Still Need To Do (Outside Lovable)

1. **Register the widget bundle ID** in Apple Developer Portal:
   - Go to Identifiers → Add → `app.sociva.community.LiveDeliveryWidget`
   - Enable the "Live Activities" capability on it

   Without this, `app-store-connect fetch-signing-files` will fail even though the command is already in your YAML (line 442).

2. **Re-run the Codemagic build** after this fix is pushed.

