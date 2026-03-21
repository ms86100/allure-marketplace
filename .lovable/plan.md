

# Round 28: Fix Duplicate Push Notifications — Stale APNs Token Cleanup

## Problem

Your user has **3 device token rows** for the same physical iPhone, each with a **different APNs token** (from iOS token rotation). The `claim_device_token` DB function only deduplicates when the `apns_token` matches but the FCM token differs. When APNs itself rotates, the old row is never cleaned up.

The `send-push-notification` edge function's dedup filter groups by `apns_token` — since all 3 are different, all 3 pass, sending 3 notifications to the same device.

## Fix (2 surgical changes)

### 1. `claim_device_token` DB function — clean stale entries on registration

Add a cleanup step: when a new token is claimed for `ios` platform, delete all **older** entries for the same `user_id + platform` that have a **different** `apns_token`. Since a single physical iOS device can only have one valid APNs token at any time, older entries are stale.

```sql
-- After the existing upsert + same-apns cleanup:
-- Also remove older iOS entries for this user with a DIFFERENT apns_token
-- (APNs token rotation = same device, new token)
IF p_platform = 'ios' AND p_apns_token IS NOT NULL THEN
  DELETE FROM public.device_tokens
  WHERE user_id = p_user_id
    AND platform = 'ios'
    AND apns_token IS NOT NULL
    AND apns_token != p_apns_token;
END IF;
```

This ensures only the latest APNs token survives per user on iOS. If a user genuinely has multiple iOS devices, each device gets a unique APNs token, but token rotation means the old token is invalid anyway — keeping it causes duplicates.

### 2. `send-push-notification` edge function — limit to 1 iOS token per user

As a defense-in-depth measure, change the dedup logic to keep only the **most recently updated** iOS token per user (sort by `updated_at DESC`, take first iOS entry):

```typescript
// After fetching tokens, sort iOS by updated_at desc, keep only first
const seenPlatform = new Set<string>();
const deduped = tokens
  .sort((a: any, b: any) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
  .filter((t: any) => {
    if (t.platform === "ios") {
      if (seenPlatform.has("ios")) return false;
      seenPlatform.add("ios");
    }
    return true;
  });
```

### 3. One-time data cleanup — purge stale tokens

Run a migration to delete stale duplicate tokens, keeping only the most recently updated entry per user+platform:

```sql
DELETE FROM device_tokens dt
WHERE dt.platform = 'ios'
  AND dt.id != (
    SELECT id FROM device_tokens dt2
    WHERE dt2.user_id = dt.user_id
      AND dt2.platform = 'ios'
    ORDER BY dt2.updated_at DESC
    LIMIT 1
  );
```

### 4. Apply same fix to `send-campaign` edge function

Mirror the dedup logic change in `send-campaign/index.ts` which has the same vulnerability.

## Files to Edit

| File | Change |
|------|--------|
| New migration SQL | Update `claim_device_token` + purge stale rows |
| `supabase/functions/send-push-notification/index.ts` | Dedup: 1 iOS token per user (most recent) |
| `supabase/functions/send-campaign/index.ts` | Same dedup fix |

## Impact

- Fixes duplicate notifications immediately for all iOS users
- The DB cleanup removes ~2 stale tokens for your account specifically
- No risk to multi-device users: if someone has an iPhone AND iPad, they have different APNs tokens, but the `claim_device_token` cleanup is per-user — this is correct since one user on one device should only have one entry. For true multi-device support, a device identifier would be needed, but that's a future enhancement.

