

# Finding: Credentials Are NOT in the Code — Manual Copy Required

After thoroughly searching the source project, **API keys are NOT hardcoded anywhere in the codebase**. They are stored in the `admin_settings` database table of the source project's Supabase (`rvvctaikytfeyzkwoqxg`) — a completely separate database from this project (`kkzkuyhgdvyecmxtmkpy`). I cannot read across databases.

---

## What You Need To Do

### Copy credentials from the source project's database

1. Open the **source project's** Supabase Table Editor → `admin_settings` table:
   `https://supabase.com/dashboard/project/rvvctaikytfeyzkwoqxg/editor`
2. Copy the `value` for each key listed below
3. Paste them into **this project's** Supabase Secrets page:
   `https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/settings/functions`

| DB key in source `admin_settings` | Add as Supabase Secret | Purpose |
|---|---|---|
| `msg91_auth_key` | `MSG91_AUTH_KEY` | OTP login — **required to unblock auth** |
| `msg91_widget_id` | `MSG91_WIDGET_ID` | OTP login |
| `msg91_token_auth` | `MSG91_TOKEN_AUTH` | OTP login |
| `razorpay_key_id` | `RAZORPAY_KEY_ID` | Payments |
| `razorpay_key_secret` | `RAZORPAY_KEY_SECRET` | Payments |
| `google_maps_api_key` | `GOOGLE_MAPS_API_KEY` | Maps |
| `firebase_service_account` | `FIREBASE_SERVICE_ACCOUNT` | Android push |
| `apns_key_p8` | `APNS_KEY_P8` | iOS push |
| `apns_key_id` | `APNS_KEY_ID` | iOS push |
| `apns_team_id` | `APNS_TEAM_ID` | iOS push |
| `apns_bundle_id` | `APNS_BUNDLE_ID` | iOS push |

**Minimum to unblock login**: just the 3 MSG91 keys.

---

## What I Will Do (after your approval)

1. Create migration to ensure `admin_settings` table and missing schema elements exist in this DB
2. Fix `supabase/config.toml` project ID to `kkzkuyhgdvyecmxtmkpy`
3. Ensure CredentialsManager UI is accessible from the Admin page
4. Redeploy edge functions
5. Test OTP flow once you confirm credentials are added

---

## Why This Cannot Be Automated

The credentials live in the source project's **private database** — a separate Supabase instance I cannot access from this project. The edge functions use `getCredential(dbKey, envKey)` which checks the DB table first, then env vars as fallback. Both locations in this project are currently empty.

