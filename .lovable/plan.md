
Problem I’m solving: the iOS CI build is still failing at archive with exit code 65.

What I found:
- `codemagic.yaml` no longer hardcodes `CODE_SIGN_STYLE=Manual` or `CODE_SIGN_IDENTITY=Apple Distribution`.
- The only remaining `CODE_SIGN_STYLE` / `CODE_SIGN_IDENTITY` references are debug `puts` lines.
- The build still logs `CODE_SIGN_STYLE=Manual` because `xcode-project use-profiles` / `xcode-project build-ipa` applies provisioning profiles and invokes `xcodebuild` that way internally. So the word “Manual” in the log is not, by itself, proof that your YAML is still wrong.
- Official Codemagic docs say:
  - `ios_signing.bundle_identifier` must be a single string.
  - extension profiles are matched automatically from the main bundle identifier.
  - you should use either the built-in `ios_signing` flow or explicit file references, not a redundant hybrid setup.
- Your workflow is still overly complex in one risky area: it globally rewrites `PRODUCT_BUNDLE_IDENTIFIER` in `project.pbxproj` with `sed`, then partially restores the widget target afterward. That can destabilize signing for generated targets/configs.
- The most likely real blocker now is one of these:
  1. widget App ID / profile / capability mismatch on Apple’s side,
  2. project signing settings being mutated too broadly by the CI scripts,
  3. hidden archive error lines being swallowed by the high-level build wrapper.

Do I know what the issue is?
Yes: the next fix should not focus on “removing Manual from the log”. The real issue is a remaining signing/profile mismatch around the generated Live Activity widget extension, plus an over-complicated CI script that makes the signing state brittle.

Plan:
1. Simplify the iOS signing flow in `codemagic.yaml`
- Keep `environment.ios_signing` with:
  - `distribution_type: app_store`
  - `bundle_identifier: app.sociva.community`
- Remove the redundant manual signing bootstrap commands:
  - `keychain initialize`
  - `app-store-connect fetch-signing-files ...`
  - `keychain add-certificates`
- Keep only `xcode-project use-profiles` before the build.
- Apply the same cleanup to both `ios-release` and `release-all`.

2. Replace broad `sed` rewrites with target-specific project edits
- Remove the global `sed` that rewrites every `PRODUCT_BUNDLE_IDENTIFIER`.
- Update bundle IDs, deployment target, and team only through the existing Ruby `xcodeproj` logic for:
  - `App`
  - `LiveDeliveryWidgetExtension`
- This avoids accidental damage to extension or generated target settings.

3. Add stricter preflight checks before archive
- Print signing info for both `App` and `LiveDeliveryWidgetExtension`.
- Fail early if either target is missing:
  - correct bundle ID,
  - team ID,
  - entitlements path,
  - deployment target `16.1`.
- Add an explicit check that the widget target still exists and is embedded exactly once.

4. Improve diagnostics if archive still fails
- Temporarily swap the `xcode-project build-ipa` step for a raw `xcodebuild archive | tee` step so the first real `error:` line is preserved in logs.
- This is only for diagnosis if the simplified signing flow still fails.

5. Validate the required Apple-side configuration
- Confirm the widget bundle ID exists externally as:
  - `app.sociva.community.LiveDeliveryWidget`
- Confirm the widget App ID has the Live Activities capability enabled.
- Confirm a valid App Store distribution provisioning profile can be generated for that widget App ID.
- This matters because the widget target is created in CI and ActivityKit entitlements must match the profile.

Files/systems involved:
- `codemagic.yaml` (main implementation work)
- Apple Developer signing setup for `app.sociva.community.LiveDeliveryWidget` (required external dependency)

Technical details:
- The current log line with `CODE_SIGN_STYLE=Manual` is compatible with Codemagic’s profile-application flow and should not be treated as the root cause by itself.
- The highest-risk code path in the repo is the global `sed` replacement of `PRODUCT_BUNDLE_IDENTIFIER`; that should be removed in favor of deterministic per-target Ruby updates.
- The widget’s minimum iOS target should stay at `16.1` for ActivityKit support.
- The React ref warnings in the browser console are unrelated to this CI failure.

Expected outcome:
- Cleaner signing configuration
- Less chance of target settings being corrupted during CI
- Either the build succeeds, or the next failing run exposes the actual archive error clearly instead of only exit code 65
