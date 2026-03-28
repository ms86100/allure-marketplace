

# Add `google-services.json` Copy Step to Android Release Workflow

## What's needed

The `android-release` workflow (line 866-917) is missing a step to copy `google-services.json` into the Android project. Without it, Firebase/FCM won't initialize and push notifications won't work on Android.

## Changes

### 1. Create `android-config/` directory with a README placeholder
Since the directory doesn't exist yet, create `android-config/README.md` explaining that `google-services.json` should be placed here.

### 2. Add copy step to `android-release` workflow
Insert after "Copy custom notification sound (Android)" (line 901) and before "Set Android SDK location" (line 903):

```yaml
- name: Copy google-services.json
  script: |
    if [ -f "android-config/google-services.json" ]; then
      cp android-config/google-services.json android/app/google-services.json
      echo "=== google-services.json copied from android-config/ ==="
    else
      echo "WARNING: android-config/google-services.json not found — Firebase will not work"
    fi
```

### 3. Add same step to `release-all` workflow
The `release-all` workflow also builds Android — add the same copy step there after the Android platform is added.

## Files changed

| File | Change |
|------|--------|
| `android-config/README.md` | New — instructions to place `google-services.json` here |
| `codemagic.yaml` | Add copy step to `android-release` and `release-all` workflows |

## After this change
You'll need to download `google-services.json` from Firebase Console (for package `app.sociva.community`) and commit it to `android-config/google-services.json` in your repo. Once that file is present, Codemagic will automatically copy it during Android builds.

