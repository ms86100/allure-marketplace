

## Cleanup Plan

**Delete all 3 rows** from `device_tokens`. All have `apns_token = NULL` and are from the pre-fix build. After a fresh install with the new build, the corrected registration flow will repopulate with proper FCM + APNs tokens.

### SQL Migration

```sql
DELETE FROM device_tokens 
WHERE apns_token IS NULL;
```

This removes:
- Seller's stale token (`fZYG2o…T-c`)
- Buyer's valid token (`d_QNyH…7KE`) 
- Buyer's duplicate token (`fZYG2o…T-c`)

All three will be recreated with both `token` and `apns_token` populated when you log in on the fresh build.

No code changes needed — database cleanup only.

