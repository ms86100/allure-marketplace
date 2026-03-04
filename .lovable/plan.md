

## Push Notification End-to-End Audit: Findings and Fix Plan

### Executive Summary

After auditing the entire push notification pipeline — from the native app's permission flow through token capture, database storage, queue processing, and delivery edge functions — I identified **4 concrete bugs** that explain why push notifications are not working dynamically in production. The backend pipeline (cron job, queue processing, edge functions, APNs secrets) is all correctly configured and healthy. **The problem is entirely in the client-side token capture logic.**

---

### Database Evidence (Production Data)

| Metric | Value | Verdict |
|--------|-------|---------|
| Total device_tokens | 3 | Some tokens exist |
| Tokens with `apns_token` populated | **0** | APNs direct delivery impossible |
| Tokens for buyer `a6aa9489` | **0** | Buyer has no token at all |
| Failed notification_queue items | 14 | All show `Push sent=0` |
| Push logs for buyer `a6aa9489` | **0** | Native flow never ran for this user |

---

### Bug #1 (ROOT CAUSE): Main registration listener does NOT capture APNs token

**File**: `src/hooks/usePushNotifications.ts`, line 684

The main `registration` event listener inside the `useEffect` (line 672-733) receives the raw 64-character APNs token on iOS but **never stores it to `apnsTokenRef.current`**. It only logs it, then calls `FCM.getToken()` to convert to an FCM token, and passes the FCM token to `handleValidToken` → `saveTokenToDatabase`.

`saveTokenToDatabase` reads `apnsTokenRef.current` at line 167 — but it's still `null` because this listener never set it.

There are two other listeners that DO capture the APNs token:
- `attemptRegistration` line 440 (sets `apnsTokenRef.current`)
- `requestFullPermission` line 1145 (sets `apnsTokenRef.current`)

But these are **duplicate listeners** that fire in parallel with the main one. Due to async execution ordering, the main listener's `saveTokenToDatabase` call may execute before the duplicate listener has set the ref. This is a classic race condition.

**Fix**: Add `apnsTokenRef.current = rawToken` inside the main effect listener (line 684) immediately when the 64-char hex is detected, BEFORE calling `FCM.getToken()`. Then remove the duplicate listeners from `attemptRegistration` and `requestFullPermission`.

### Bug #2: Duplicate registration listeners accumulate

Every call to `attemptRegistration()` adds a new `registration` listener (line 440). Every call to `requestFullPermission()` adds another (line 1145). The main effect adds one more (line 672). These are never cleaned up between calls.

On a typical app session with login + resume + "Turn On" tap, there can be 4-6 active registration listeners. Each fires on the same event, calling `handleValidToken` or `saveTokenToDatabase` multiple times.

**Fix**: Remove the duplicate listener registrations from `attemptRegistration` and `requestFullPermission`. The single listener in the main effect is sufficient — it just needs to capture the APNs token (Bug #1 fix).

### Bug #3: Cross-user token cleanup silently fails

`saveTokenToDatabase` at line 171-175 attempts:
```sql
DELETE FROM device_tokens WHERE token = :token AND user_id != :currentUser
```

But the RLS policy on `device_tokens` only allows `DELETE WHERE auth.uid() = user_id`. This means the cleanup of OTHER users' tokens is a silent no-op. If two users log into the same physical device, both will have the same FCM token, and notifications for one user may be delivered to the wrong person.

**Fix**: Create a `SECURITY DEFINER` function `claim_device_token(p_user_id, p_token, p_platform, p_apns_token)` that atomically:
1. Deletes the token from any other user
2. Upserts for the current user (with `COALESCE` on `apns_token` to never overwrite a good value with null)

Then update `saveTokenToDatabase` to call `supabase.rpc('claim_device_token', ...)`.

### Bug #4: Diagnostics don't validate APNs token presence

The `runPushDiagnostics` function checks if tokens exist in the DB (step 6) but never checks if `apns_token` is populated for iOS devices. Since you chose to require APNs token for a healthy state, the diagnostics should flag this explicitly.

**Fix**: Add a step 6c in `pushDiagnostics.ts` that checks `apns_token IS NOT NULL` for iOS device tokens and reports it as a failure if missing.

---

### What is Working Correctly

- Backend secrets: `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` are all configured
- `FIREBASE_SERVICE_ACCOUNT` is configured
- Cron job fires every minute to process the notification queue
- `claim_notification_queue` function handles atomic batch claiming
- `process-notification-queue` edge function processes items with retry/dead-letter logic
- `send-push-notification` correctly routes: iOS with `apns_token` → direct APNs, else → FCM
- `send-campaign` also correctly handles APNs vs FCM routing
- Order status triggers correctly insert into `notification_queue`
- Client-side fire-and-forget `process-notification-queue` call after order placement works
- FCM delivery to iOS IS working (confirmed in edge function logs: `[FCM] ✅ Delivered`)

---

### Implementation Plan

**Step 1: Database migration** — Create `claim_device_token` RPC function

**Step 2: Fix `usePushNotifications.ts`**
- In the main effect listener (line 684): add APNs token capture
- Remove duplicate listeners from `attemptRegistration` (lines 434-451) and `requestFullPermission` (lines 1138-1156)
- Replace `saveTokenToDatabase` internals to use `claim_device_token` RPC

**Step 3: Update `pushDiagnostics.ts`**
- Add APNs token validation step for iOS

**Step 4: No changes needed to**:
- Edge functions (already handle APNs correctly)
- `EnableNotificationsBanner.tsx` / `NotificationsPage.tsx` (UI flow is correct)
- `PushNotificationProvider.tsx` (architecture is correct)
- Backend cron/queue infrastructure

### Technical Detail: The Corrected iOS Flow

```text
User taps "Turn On"
  → requestFullPermission()
    → PN.requestPermissions()     // OS popup appears
    → PN.register()               // Triggers registration event
    → [800ms wait]
    → reconcileRuntimeToken()     // FCM.getToken() → saveTokenToDatabase()

Meanwhile, the SINGLE main effect listener:
  → registration event fires with raw 64-char APNs token
  → apnsTokenRef.current = rawToken    ← THIS IS THE FIX
  → FCM.getToken() with retries
  → handleValidToken(fcmToken)
  → saveTokenToDatabase(fcmToken)
    → reads apnsTokenRef.current       ← NOW HAS THE VALUE
    → claim_device_token(user, fcm_token, 'ios', apns_token)
    → Both tokens stored in DB ✓

Later, when a notification is sent:
  → send-push-notification reads device_tokens
  → Sees apns_token IS NOT NULL for iOS
  → Uses direct APNs delivery via .p8 key
  → Notification arrives ✓
```

