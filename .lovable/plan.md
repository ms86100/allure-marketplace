## End-to-End Trace Results

### Step-by-step findings:


| Step                                | Status                        | Details                                                                    |
| ----------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| 1. Seller device token exists?      | **Yes**                       | Token `fZYG2o...` registered, platform=ios                                 |
| 2. APNs token stored?               | **No — `apns_token` is NULL** | This is the root cause                                                     |
| 3. Notification queued for seller?  | **Yes**                       | "New Order Received!" queued at 06:22:47, status=processed                 |
| 4. Push attempted?                  | **Yes**                       | Edge function invoked, returned 200                                        |
| 5. Delivery path used?              | **FCM** (not direct APNs)     | Because `apns_token` is NULL, the code fell through to FCM at line 402-412 |
| 6. FCM response?                    | **"Delivered"**               | FCM returned 200 with a message ID                                         |
| 7. Notification received on device? | **No**                        | FCM-to-iOS delivery is unreliable without direct APNs                      |


### Root Cause

The seller's device token record has `apns_token: NULL`. This means when the seller tapped "Turn On Notifications" and allowed permissions, the registration listener captured the raw APNs token into `apnsTokenRef.current` **only if** the raw token from the `registration` event matched the 64-character hex pattern. 

The problem is timing: `PushNotifications.register()` fires the `registration` event with the raw APNs token. But line 650 only captures it if it matches `/^[A-Fa-f0-9]{64}$/`. If the token doesn't match that pattern (e.g., it's already an FCM-format token on some Capacitor versions), `apnsTokenRef.current` stays null. Then `saveTokenToDatabase` at line 167 reads `apnsTokenRef.current` as null and passes null to `claim_device_token`.

The edge function then uses FCM as a fallback (line 404), which reports "delivered" but FCM-to-iOS delivery is unreliable — Apple's APNs is the only reliable path for iOS push.

### Fix Plan

**1. `EnableNotificationsBanner.tsx` — Fix "Enabling..." stuck state**

Change `handleTurnOn` to fire-and-forget `requestFullPermission()` after `register()` succeeds, so the button clears immediately:

```typescript
await PushNotifications.register();
// Fire-and-forget — don't block UI on long reconciliation chain
requestFullPermission().catch(e => console.warn('[Push] Background reconciliation:', e));
setLoading(false);
```

**2.** `NotificationsPage.tsx` **— Same fire-and-forget pattern**

Apply identical change to the notification settings toggle handler.

**3.** `usePushNotifications.ts` **— Ensure APNs token capture is resilient**

The registration listener at line 650 only captures the APNs token if `rawToken` matches `/^[A-Fa-f0-9]{64}$/`. But on some iOS/Capacitor versions, the `registration` event may return the token in a different format. Add a fallback: after `FCM.getToken()` succeeds, if `apnsTokenRef.current` is still null, attempt to retrieve the APNs token via `FCM.getAPNSToken()` (available in `@capacitor-community/fcm`).

```typescript
// After FCM.getToken() succeeds, if APNs token wasn't captured from registration event:
if (!apnsTokenRef.current) {
  try {
    const apnsResult = await fcm.getAPNSToken?.();
    if (apnsResult?.token && /^[A-Fa-f0-9]{64}$/.test(apnsResult.token)) {
      apnsTokenRef.current = apnsResult.token;
      console.log('[Push][iOS] APNs token recovered via FCM.getAPNSToken()');
    }
  } catch {}
}
```

Also in `reconcileRuntimeToken`: after getting the FCM token, similarly attempt to recover the APNs token if it's missing.

**4. No backend changes needed**

The `claim_device_token` RPC and `send-push-notification` edge function are both correct — they handle `apns_token` properly when it's provided. The issue is purely client-side: the APNs token isn't being captured and stored.