

# Migrate Hardcoded Credentials to DB-First (`admin_settings`) Pattern

## Problem

Three edge functions still read credentials directly from `Deno.env.get()` instead of checking `admin_settings` first:

| Function | Hardcoded credentials |
|---|---|
| `send-campaign` | `FIREBASE_SERVICE_ACCOUNT`, `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` |
| `daily-society-digest` | `FIREBASE_SERVICE_ACCOUNT` |
| `test-apns-direct` | `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` |

The other functions (`send-push-notification`, `msg91-send-otp`, `msg91-verify-otp`, `create-razorpay-order`, `razorpay-webhook`) already use the DB-first pattern correctly.

## What Changes

### 1. Create shared `getCredential` helper — `supabase/functions/_shared/credentials.ts`

Extract the duplicated `getCredential` function into one shared file so all edge functions use the same logic: check `admin_settings` first, fall back to env.

### 2. Update `send-campaign/index.ts`

Replace `Deno.env.get("FIREBASE_SERVICE_ACCOUNT")` and all APNs env reads (lines 406-420) with `getCredential()` calls using the shared helper. Create a service-role Supabase client at the top of the handler (already has one).

### 3. Update `daily-society-digest/index.ts`

Replace `Deno.env.get("FIREBASE_SERVICE_ACCOUNT")` (line 86) with `getCredential()` call.

### 4. Update `test-apns-direct/index.ts`

Replace all four `Deno.env.get()` calls for APNs credentials (lines 79-82) with `getCredential()` calls.

### 5. Update existing functions to use shared helper

Refactor `send-push-notification`, `msg91-send-otp`, and `msg91-verify-otp` to import `getCredential` from `_shared/credentials.ts` instead of duplicating the function inline.

## Files Modified

- `supabase/functions/_shared/credentials.ts` — **new** shared helper
- `supabase/functions/send-campaign/index.ts` — use DB-first credentials
- `supabase/functions/daily-society-digest/index.ts` — use DB-first credentials
- `supabase/functions/test-apns-direct/index.ts` — use DB-first credentials
- `supabase/functions/send-push-notification/index.ts` — use shared import
- `supabase/functions/msg91-send-otp/index.ts` — use shared import
- `supabase/functions/msg91-verify-otp/index.ts` — use shared import

## No UI changes needed

The `CredentialsManager.tsx` already has all the correct tabs and keys defined (Payment, SMS/OTP, Push, Maps). Once credentials are saved via the admin panel, the edge functions will read them from DB automatically.

