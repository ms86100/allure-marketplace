

# Remove Google Play Auto-Upload from Codemagic

## What changes

Two spots in `codemagic.yaml` where `google_play` publishing is configured need to be updated:

### 1. `android-release` workflow (lines 922-926)
- Remove the entire `publishing:` block with `google_play` credentials
- Add an `email` publishing block instead (so you get notified when build completes with artifact link)

### 2. `release-all` workflow (lines 1688-1691)
- Remove the `google_play:` section from its `publishing:` block
- Keep the `app_store_connect` publishing intact

### 3. Clean up `google_play` group reference
- Remove `- google_play` from `environment.groups` in both workflows since the credentials are no longer needed

## After the change
- Codemagic will still build and sign the `.aab` using your keystore
- The signed `.aab` will appear in the **Artifacts** tab of each build
- You download it and manually upload to Google Play Console
- No more "service account credentials" errors

