

## Fix: Codemagic YAML Validation Error

### Problem
Codemagic's `ios_signing.bundle_identifier` field expects a **string**, not a list. Lines 21-23 and 651-653 use an array, which Codemagic rejects.

### Fix

**Both `ios-release` (line 19-23) and `release-all` (line 649-653) workflows** — change from:

```yaml
ios_signing:
  distribution_type: app_store
  bundle_identifier:
    - app.sociva.community
    - app.sociva.community.LiveDeliveryWidget
```

To:

```yaml
ios_signing:
  distribution_type: app_store
  bundle_identifier: app.sociva.community
```

The widget signing is already handled by the `app-store-connect fetch-signing-files` call for the widget bundle ID + `xcode-project use-profiles` in the "Set up code signing" step. That step explicitly fetches profiles for both bundle IDs and applies them — so the widget will still be signed correctly.

### What stays the same
- The `Set up code signing` step already fetches profiles for **both** `app.sociva.community` and `app.sociva.community.LiveDeliveryWidget` — no changes needed there
- The Ruby scripts that configure the widget target — no changes needed
- The build command using `xcode-project use-profiles` — already correct

### Summary
Two lines changed in total (one per workflow). Everything else stays as-is.

