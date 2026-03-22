

## Analysis: Device Token Deduplication — What's Already Implemented vs What's Missing

### Current State (Already Robust)

Your system already handles most of the scenarios described:

| Scenario | Current handling |
|---|---|
| iOS token rotation | `claim_device_token` deletes old iOS entries when new `apns_token` arrives |
| Same FCM token, different user | `claim_device_token` deletes token from other users before upserting |
| iOS dedup at send time | `send-push-notification` keeps only the most recent iOS token per user |
| Invalid/expired tokens | Both APNs (410) and FCM (UNREGISTERED) trigger immediate `DELETE` of the token row |
| APNs placeholder cleanup | Real FCM token replaces `apns:` prefixed placeholders |

### Actual Gap: Android Reinstall

When an Android user reinstalls, a **new FCM token** is generated. The old token stays in `device_tokens`. On next push:
- FCM returns `UNREGISTERED` → old token gets deleted (self-healing)
- But there's a **window** where the user gets a duplicate push (one to old token that silently fails, one to new token that succeeds)

This is not a real duplicate delivery problem — the old token fails silently. The only real issue is wasted API calls.

### Proposed Fix (Minimal, Non-Breaking)

**File: `supabase/migrations/` — Update `claim_device_token`**
- Add Android dedup: when platform is `android`, delete all other Android entries for the same `user_id` with a different token. Mirrors the iOS cleanup logic. This ensures only one Android token exists per user at any time.

```sql
-- After the existing upsert, add:
IF p_platform = 'android' THEN
  DELETE FROM public.device_tokens
  WHERE user_id = p_user_id
    AND platform = 'android'
    AND token != p_token;
END IF;
```

**File: `supabase/functions/send-push-notification/index.ts`**
- Extend the existing iOS dedup logic to also deduplicate Android tokens (keep only most recent per platform). Currently only iOS is deduped at send time.

That's it. Two small changes. The rest of the user's request (device registry, stable device_id, notification event_id, background cleanup jobs) is either already implemented or would be over-engineering given the self-healing invalid-token cleanup already in place.

### Files Changed

| File | Change |
|---|---|
| New migration SQL | Add Android platform dedup to `claim_device_token` |
| `supabase/functions/send-push-notification/index.ts` | Extend send-time dedup to cover Android (keep latest per platform) |

