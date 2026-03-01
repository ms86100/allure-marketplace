
Root cause (definitive, code-backed):
The failure is in the permission flow state machine, not in missing native files.
On iOS, your code auto-requests notification permission in the background login effect (`usePushNotifications.ts` lines 506-518). If that request does not end in `granted`, the hook sets a terminal `permission_denied` state (`195-199`), and future registration attempts are skipped (`286-289`). The resume handler only retries when permission is already `granted` (`475-481`), so the app can get stuck never reaching APNs registration and never creating the iOS “Notifications” settings section.

Evidence across all areas you requested:

1) APNs Registration Path
- JS path exists: `PushNotifications.register()` is called in iOS path (`206`).
- Native mapping exists: Capacitor Push plugin calls `UIApplication.shared.registerForRemoteNotifications()` (`PushNotificationsPlugin.swift` `57-60`).
- AppDelegate callback is implemented in CI-generated file (`codemagic.yaml` `155-163`, `500-508`).
- Firebase APNs token bridge exists: `Messaging.messaging().apnsToken = deviceToken` (`FirebaseMessagingPlugin.swift` `219-224`).

2) AppDelegate Integrity
- CI rewrites `ios/App/App/AppDelegate.swift` every build (`codemagic.yaml` `122-173`, `470-517`).
- Push delegate methods are present in generated content.
- Swizzling disabled intentionally (`FirebaseAppDelegateProxyEnabled=false`, `216-217`, `556-557`), with manual forwarding in AppDelegate, which is valid.

3) Entitlements Validation
- CI creates `App/App.entitlements` with `aps-environment=production` (`178-190`, `522-534`).
- CI links `CODE_SIGN_ENTITLEMENTS` (`199-201`, `542-544`).
- Current IPA check uses `grep` in unzipped payload (`301-305`, `637-640`) which is weaker than codesign introspection.

4) Xcode Capabilities
- CI injects `UIBackgroundModes` including `remote-notification` (`210-212`, `552-554`).
- Push entitlement is added via entitlements file and linked to target.

5) CI / CodeMagic impact
- `npx cap add ios` can overwrite iOS project, but CI immediately re-patches AppDelegate + entitlements afterward, so these pieces are reapplied.
- Signing profiles are fetched automatically (`259-263`, `595-599`), but current pipeline does not strongly assert the signed entitlements in final binary.

6) Permission Request Flow (actual bug)
- Request is triggered automatically after login with timeout (`506-518`), not explicitly tied to a visible user action.
- Non-granted result goes terminal (`195-199`), preventing future attempts (`286-289`).
- This is the lockout pattern causing your “still no Notifications section” symptom.

Permanent fix plan (implementation):
A) Fix the permission state machine (primary fix)
- In `usePushNotifications.ts`:
  - Do not set terminal `permission_denied` on first non-granted result while status may still be `prompt`/undetermined race.
  - Allow retry path from `prompt` and from failed request states.
  - Add bounded retries with backoff for iOS registration path before terminal fail.
  - Separate “user denied explicitly” from “request did not surface / transient.”

B) Move permission prompt to explicit user interaction (hard reliability fix)
- Trigger `requestPermissions()` from an explicit in-app CTA (e.g., onboarding/notifications CTA) after first meaningful interaction.
- Keep silent setup/listeners on login, but only invoke OS prompt from user action.
- This avoids iOS timing suppression during early app lifecycle.

C) Add native-level instrumentation for proof
- Add high-signal logs around:
  - before/after `requestPermissions`
  - before/after `register()`
  - AppDelegate callbacks for `didRegister...` / `didFail...`
- Mirror final status to a small debug surface in-app (for TestFlight builds) so you can verify without Xcode console.

D) Harden CI verification (to remove ambiguity permanently)
- Replace IPA entitlement `grep` with:
  - `codesign -d --entitlements :- Payload/App.app` and assert `aps-environment`
  - decode `embedded.mobileprovision` and assert push capability exists in provisioning
- Fail build if either check does not pass.
- Keep existing AppDelegate verification gate.

E) End-to-end acceptance criteria (must all pass)
1. Fresh install TestFlight build.
2. Tap explicit “Enable notifications” CTA.
3. iOS permission popup appears.
4. iOS Settings shows Notifications section with Banners/Sounds/Badges controls.
5. App logs show:
   - permission granted
   - registerForRemoteNotifications reached
   - didRegisterForRemoteNotifications callback fired
   - token persisted in backend.
6. Send test notification and confirm delivery.

Technical details (concise):
- Root cause location: `src/hooks/usePushNotifications.ts` (`195-199`, `286-289`, `475-481`, `506-518`).
- Native APNs path exists and is wired correctly via plugin + AppDelegate.
- Most likely repeated failure mechanism is permission-flow lockout, not missing AppDelegate code.
- CI should still be upgraded to cryptographically verify signed entitlements in final IPA to eliminate remaining deployment uncertainty.
