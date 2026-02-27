

## Root Cause Analysis: Push Notifications Not Working on iOS

### The Problem

The `device_tokens` table is empty (verified: 0 rows) despite the app being rebuilt and notifications being granted. The notification queue IS working — `notification_queue` and `user_notifications` tables show processed entries (e.g., "New Order Received!"). But `send-push-notification` finds 0 device tokens, so push delivery silently fails.

### TRUE Root Cause: Missing AppDelegate.swift Forwarding Methods

**This is a native iOS bridge issue, not a code bug.**

The Capacitor Push Notifications plugin requires two methods in `AppDelegate.swift` to forward the APNs device token to the JavaScript layer:

```text
AppDelegate.swift (REQUIRED by @capacitor/push-notifications):

func application(_ application: UIApplication,
  didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(
      name: .capacitorDidRegisterForRemoteNotifications,
      object: deviceToken)
}

func application(_ application: UIApplication,
  didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(
      name: .capacitorDidFailToRegisterForRemoteNotifications,
      object: error)
}
```

**Without these methods:**
1. `PushNotifications.register()` calls iOS to request an APNs token (succeeds)
2. iOS returns the token to `AppDelegate.didRegisterForRemoteNotifications...`
3. But nobody forwards it to Capacitor's notification center
4. The `registration` event in JavaScript **never fires**
5. Token is never captured, never saved to `device_tokens`
6. All push notifications fail with "No device tokens found for user"

The `codemagic.yaml` CI pipeline correctly:
- Adds Push Notifications entitlement (aps-environment: production)
- Adds Background Modes (remote-notification, fetch)
- Copies GoogleService-Info.plist

But it does **NOT** modify `AppDelegate.swift` to add the required forwarding methods.

### Why There's No Buzzing When App Is Closed/Background

Background and closed-app notifications are delivered via FCM push. Since there are 0 device tokens, FCM has no destination to send to. The in-app buzzing (`useNewOrderAlert`) only works when the app is in the foreground and uses Supabase Realtime + polling — it cannot work when the app is closed.

### Fix Plan

**Single change: Add a Codemagic build step that injects the required AppDelegate.swift methods.**

This modifies `codemagic.yaml` to add a script step (in both `ios-release` and `release-all` workflows) that uses `sed` to inject the two required methods into the Capacitor-generated `AppDelegate.swift` file after `npx cap sync ios`.

**Files changed:**
- `codemagic.yaml` — Add build script step "Patch AppDelegate for Push Notifications" after the "Add iOS platform" step in both iOS workflows

**What the script does:**
- Locates `ios/App/App/AppDelegate.swift`
- Injects the two required forwarding methods before the closing brace of the class
- Only injects if not already present (idempotent)

**What is NOT touched:**
- No changes to `usePushNotifications.ts` (client code is correct)
- No changes to `PushNotificationProvider.tsx`
- No changes to edge functions
- No changes to database tables or RLS policies
- No changes to `capacitor.config.ts`

After this fix is deployed and the app is rebuilt via Codemagic, the flow will be:
1. App opens → user signs in → `usePushNotifications` calls `PushNotifications.register()`
2. iOS requests APNs token → AppDelegate forwards to Capacitor bridge
3. `registration` event fires → token saved to `device_tokens`
4. Push notifications now work for foreground, background, and closed app states

