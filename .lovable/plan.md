

# Finding: Credentials Are NOT in the Code — They Must Be Copied Manually

After thoroughly searching the source project (`Block Eats Importer`), I confirmed that **API keys are NOT hardcoded anywhere in the codebase**. They are stored in the `admin_settings` database table of the **source project's Supabase instance** (`rvvctaikytfeyzkwoqxg`), which is a completely **separate database** from this project's Supabase (`kkzkuyhgdvyecmxtmkpy`).

I cannot read one project's database from another project — they are isolated.

---

## How the Source Project Manages Credentials

The source project has a **Credentials Manager UI** (`CredentialsManager.tsx`) accessible from the Admin Panel. Admins enter API keys through the UI, which saves them to the `admin_settings` table. Edge functions read credentials from that table at runtime (with environment variable fallback).

---

## Plan to Get Credentials Working

### Step 1 — You copy credential values manually

Go to the **source project's Supabase dashboard**:
- Open [Table Editor → admin_settings](https://supabase.com/dashboard/project/rvvctaikytfeyzkwoqxg/editor) in the source project
- Copy the `value` column for each of these keys:

| Key in admin_settings | Purpose |
|---|---|
| `msg91_auth_key` | OTP login (required to unblock auth) |
| `msg91_widget_id` | OTP login |
| `msg91_token_auth` | OTP login |
| `razorpay_key_id` | Payments |
| `razorpay_key_secret` | Payments |
| `google_maps_api_key` | Maps/location |
| `firebase_service_account` | Push notifications (Android) |
| `apns_key_p8` | Push notifications (iOS) |
| `apns_key_id` | Push notifications (iOS) |
| `apns_team_id` | Push notifications (iOS) |
| `apns_bundle_id` | Push notifications (iOS) |

### Step 2 — I set up this project's database and config

Once you approve, I will:
1. Create a migration to ensure the `admin_settings` table exists with the right schema
2. Fix `supabase/config.toml` to use this project's ref (`kkzkuyhgdvyecmxtmkpy`)
3. Ensure the CredentialsManager component is accessible from the Admin page
4. Fix any missing schema elements (columns, enums, functions)
5. Redeploy edge functions

### Step 3 — You paste credentials into this project

Either:
- **Option A**: Use this project's Admin Panel → Credentials Manager (paste values in the UI)
- **Option B**: Go to [this project's Supabase Secrets](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/settings/functions) and add them as environment variables (`MSG91_AUTH_KEY`, etc.)

### Step 4 — Verify end-to-end

I will test the OTP flow to confirm everything works.

---

## Technical Details

- Edge functions use `getCredential(dbKey, envKey)` which checks `admin_settings` table first, then falls back to `Deno.env.get(envKey)`
- Either storage method (DB table or Supabase secrets) works — the code supports both
- The `admin_settings` table needs an RLS policy allowing admin access
- Minimum credentials to unblock login: `msg91_auth_key`, `msg91_widget_id`, `msg91_token_auth`

