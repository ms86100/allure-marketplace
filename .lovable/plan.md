

# Fix: Android AAB Not Signed

## Problem

Google Play Console rejects the `.aab` because it's **unsigned**. Codemagic's `android_signing` block sets environment variables (`CM_KEYSTORE`, `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS`, `CM_KEY_PASSWORD`) — but the `android/app/build.gradle` never references them. Gradle produces an unsigned bundle.

## Fix — One file change

**File:** `android/app/build.gradle`

Add a `signingConfigs` block that reads Codemagic's environment variables, and wire it into the `release` build type:

```text
android {
    ...

    signingConfigs {
        release {
            storeFile file(System.getenv("CM_KEYSTORE") ?: "/dev/null")
            storePassword System.getenv("CM_KEYSTORE_PASSWORD") ?: ""
            keyAlias System.getenv("CM_KEY_ALIAS") ?: ""
            keyPassword System.getenv("CM_KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release    ← THIS IS THE KEY LINE
            minifyEnabled false
            proguardFiles ...
        }
    }
}
```

The `?: "/dev/null"` / `?: ""` fallbacks prevent local dev builds from crashing when the env vars aren't set — the build just won't sign (which is fine for local debug).

## Why this is the only fix needed

- Codemagic already has the keystore uploaded as `sociva_keystore` (referenced at line 874 of `codemagic.yaml`)
- Codemagic automatically sets `CM_KEYSTORE`, `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS`, `CM_KEY_PASSWORD` from that keystore
- The only missing piece is Gradle reading those variables

## After rebuild

The `.aab` artifact will be signed and Google Play Console will accept the upload.

