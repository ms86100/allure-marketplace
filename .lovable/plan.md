

# Finding: Credentials Are NOT in the Code

After thoroughly searching the source project, I confirmed that **API keys are NOT hardcoded anywhere in the codebase**. They are stored in the `admin_settings` database table of the **source project's Supabase instance** (`rvvctaikytfeyzkwoqxg`), which is a completely different database from this project's Supabase (`kkzkuyhgdvyecmxtmkpy`).

I cannot read one project's database from another — these are separate, isolated Supabase instances.

## What the source project has

The source project has a **Credentials Manager** UI (at `src/components/admin/CredentialsManager.tsx`) where an admin user enters credentials through the app's Admin Panel. These get saved to the `admin_settings` table. The edge functions then read from that table at runtime via `getCredential()`.

## How to get this working

### Option A: Use the Admin Panel in THIS project (Recommended)

1. I will ensure the `admin_settings` table exists in this project's database (create migration if needed)
2. I will ensure the CredentialsManager component is properly wired up in the Admin page
3. You log into the source project's Admin Panel, copy each credential value
4. You paste them into this project's Admin Panel → Credentials Manager

The credentials needed:
- **SMS/OTP tab**: `msg91_auth_key`, `msg91_widget_id`, `msg91_token_auth`
- **Payment tab**: `razorpay_key_id`, `razorpay_key_secret`
- **Maps tab**: `google_maps_api_key`
- **Push tab**: `firebase_service_account`, `apns_key_p8`, `apns_key_id`, `apns_team_id`, `apns_bundle_id`

### Option B: Add as Supabase Edge Function Secrets

Go to [Supabase Secrets page](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/settings/functions) and add each secret with the env var names (`MSG91_AUTH_KEY`, `MSG91_WIDGET_ID`, etc.). The edge functions check env vars as fallback.

### What I will do (after your approval)

1. Create a database migration to ensure `admin_settings` table and missing schema elements exist
2. Fix `supabase/config.toml` project ID
3. Ensure the CredentialsManager UI is accessible from the Admin page
4. Redeploy edge functions

## Summary

You need to manually copy the credential **values** from the source project (either from its Admin Panel UI or from its Supabase dashboard → Table Editor → `admin_settings`). There is no way to automate this since they are in a separate database. Once you approve this plan, I will set up everything else so that once you paste the credentials, the app works end-to-end.

