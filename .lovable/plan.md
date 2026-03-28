

# Combined Fix: Java 21 + Dependency Patches for Android Build

## Root Cause

The build fails at `:capacitor-android:compileReleaseJavaWithJavac` with `error: invalid source release: 21` because Capacitor's auto-generated `capacitor.build.gradle` requires Java 21, but Codemagic is provisioning JDK 17.

## Changes

### 1. Update `codemagic.yaml` — two lines

| Location | Line | Current | New |
|---|---|---|---|
| `android-release` workflow | 880 | `java: 17` | `java: 21` |
| `release-all` workflow | 962 | `java: 17` | `java: 21` |

No other file changes needed. The deprecation warnings from `capacitor-rate-app` (Groovy space-assignment syntax) are non-fatal warnings and do not affect the build.

## What this fixes

- JDK 21 will be provisioned on the Codemagic build machine
- `capacitor.build.gradle`'s `JavaVersion.VERSION_21` source/target will compile successfully
- The existing `scripts/patch-android-builds.cjs` (Transistorsoft Maven repo, version pinning, Kotlin dedup) continues to run as before
- The signed `.aab` artifact will be generated for manual Play Console upload

