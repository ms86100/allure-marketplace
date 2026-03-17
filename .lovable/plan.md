

# Analysis: Build Failure with Old Pipeline Version

## What the log shows

The error log references **Step 17 `Force-assign widget provisioning profile`** — but that step **no longer exists** in the current `codemagic.yaml`. This means the Codemagic build ran an **older version** of the file before the latest changes were pushed.

## Underlying concern

The log also reveals that **no provisioning profile was found** for `app.sociva.community.LiveDeliveryWidget` in the profiles directory. This means `app-store-connect fetch-signing-files` may have failed silently for the widget bundle ID. This would still be a problem even with the current (cleaned-up) pipeline.

## Plan

### 1. Add error checking after widget profile fetch

In `codemagic.yaml`, split the signing step so that after fetching the widget profile, we verify it was actually downloaded. Add a quick check between `fetch-signing-files` and `keychain add-certificates`:

```bash
# Verify widget profile was fetched
WIDGET_PROFILE=$(find ~/Library/MobileDevice/Provisioning\ Profiles -name '*.mobileprovision' -exec grep -l 'app.sociva.community.LiveDeliveryWidget' {} \; 2>/dev/null | head -1)
if [ -z "$WIDGET_PROFILE" ]; then
  echo "WARNING: Widget provisioning profile not downloaded. Listing available profiles:"
  ls -la ~/Library/MobileDevice/Provisioning\ Profiles/ 2>/dev/null || echo "No profiles directory"
  echo "Continuing anyway — use-profiles may still handle it..."
fi
```

This goes in both `ios-release` and `release-all` workflows, after the fetch commands but before `keychain add-certificates`.

### 2. Ensure latest code is deployed

The current `codemagic.yaml` already has the correct pipeline (no manual parsing). The user needs to ensure the latest commit is pushed to GitHub before triggering the next Codemagic build.

### Files modified
- `codemagic.yaml` — Add diagnostic check after profile fetch in both workflows (non-blocking, just logging)

