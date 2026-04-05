

# Plan: Get the Full Application Working End-to-End

## Problem Summary

The frontend code is fully copied, but there are **3 categories of blockers** preventing the app from working:

1. **Missing API secrets** — MSG91 OTP, Razorpay, Google Maps, APNS (iOS push), FCM credentials are not configured in this project's Supabase
2. **Database schema gaps** — columns like `minimum_order_amount`, `daily_order_limit`, `vacation_mode`, `pickup_payment_config`, `delivery_payment_config` and the `payment_pending` enum value may be missing despite migrations existing (migrations may not have been applied to this Supabase instance)
3. **Missing DB function** — `get_user_auth_context` RPC may not exist, causing the "Loading your profile..." hang

## Step-by-Step Guide

### Step 1: Add API Secrets (You Must Do This Manually)

These are private keys that cannot be copied programmatically. You need to add them as **Supabase Edge Function secrets** in your [Supabase dashboard](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/settings/functions).

**Required secrets (get values from your MSG91/Razorpay/Google accounts):**

| Secret Name | Where to Get It |
|---|---|
| `MSG91_AUTH_KEY` | [MSG91 Dashboard](https://msg91.com) → API Keys |
| `MSG91_WIDGET_ID` | MSG91 → SendOTP Widget → Widget ID |
| `MSG91_TOKEN_AUTH` | MSG91 → SendOTP Widget → Token Auth |
| `RAZORPAY_KEY_ID` | [Razorpay Dashboard](https://dashboard.razorpay.com) → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → API Keys (secret) |
| `GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials |
| `APNS_KEY_P8` | Apple Developer → Keys → APNs key (.p8 file content) |
| `APNS_KEY_ID` | Apple Developer → Keys → Key ID |
| `APNS_TEAM_ID` | Apple Developer → Account → Team ID |
| `APNS_BUNDLE_ID` | `app.sociva.community` |
| `FCM_SERVER_KEY` | Firebase Console → Project Settings → Cloud Messaging |

**Alternative:** You can also store these in the `admin_settings` table via the Admin Panel UI (the edge functions check DB first, then env secrets).

### Step 2: Database Schema Sync (I Will Do This)

I will create a single migration to add any missing columns, enum values, and functions. Based on the errors:

- Add `minimum_order_amount`, `daily_order_limit`, `vacation_mode`, `vacation_until`, `pickup_payment_config`, `delivery_payment_config` columns to `seller_profiles` (if missing)
- Add `payment_pending` value to `order_status` enum (if missing)
- Seed `payment_pending` into `order_status_config` table
- Create/replace the `get_user_auth_context` function

### Step 3: Redeploy Edge Functions (I Will Do This)

After secrets are added, I will redeploy:
- `msg91-send-otp`
- `msg91-verify-otp`
- `create-razorpay-order`
- `confirm-razorpay-payment`
- `process-notification-queue`

### Step 4: Fix Config (I Will Do This)

- Update `supabase/config.toml` project_id to match this project's Supabase ref (`kkzkuyhgdvyecmxtmkpy`)
- Ensure the `msg91-send-otp` and `msg91-verify-otp` functions are listed in config.toml

### Step 5: Verify End-to-End

After you add the secrets, I will:
1. Test OTP send via edge function curl
2. Test the auth flow in the browser
3. Verify the "Loading your profile..." screen resolves

## What You Need To Do Now

**Tell me to proceed**, and I will execute Steps 2-4 (database migration, config fix, edge function deploy).

**In parallel**, go to your [Supabase Edge Function Secrets page](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/settings/functions) and add the MSG91 secrets (at minimum `MSG91_AUTH_KEY`, `MSG91_WIDGET_ID`, `MSG91_TOKEN_AUTH`) so OTP login works.

