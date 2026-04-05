

# Plan: Get the Full Application Working End-to-End

## Problem Summary

The frontend code is fully copied, but there are **3 categories of blockers** preventing the app from working:

1. **Missing API secrets** — MSG91 OTP, Razorpay, Google Maps, APNS (iOS push), FCM credentials are not configured in this project's Supabase
2. **Database schema gaps** — columns like `minimum_order_amount`, `daily_order_limit`, `vacation_mode`, `pickup_payment_config`, `delivery_payment_config` and the `payment_pending` enum value may be missing despite migrations file existing
3. **Missing DB function** — `get_user_auth_context` RPC likely not deployed, causing the "Loading your profile..." hang

## Step-by-Step Guide

### Step 1: Add API Secrets (You Must Do This Manually)

Go to your [Supabase Edge Function Secrets page](https://supabase.com/dashboard/project/kkzkuyhgdvyecmxtmkpy/settings/functions) and add these secrets. Get the values from the same accounts used in the source project.

| Secret Name | Where to Get It |
|---|---|
| `MSG91_AUTH_KEY` | [MSG91 Dashboard](https://msg91.com) → API Keys |
| `MSG91_WIDGET_ID` | MSG91 → SendOTP Widget → Widget ID |
| `MSG91_TOKEN_AUTH` | MSG91 → SendOTP Widget → Token Auth |
| `RAZORPAY_KEY_ID` | [Razorpay Dashboard](https://dashboard.razorpay.com) → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → API Keys (secret) |
| `GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → Credentials |
| `APNS_KEY_P8` | Apple Developer → Keys → APNs key (.p8 file content) |
| `APNS_KEY_ID` | Apple Developer → Keys → Key ID |
| `APNS_TEAM_ID` | Apple Developer → Account → Team ID |
| `APNS_BUNDLE_ID` | `app.sociva.community` |
| `FCM_SERVER_KEY` | Firebase Console → Cloud Messaging |

**Alternative:** Store in the `admin_settings` table via Admin Panel (edge functions check DB first).

### Step 2: Database Schema Sync (I Will Do This)

Create a migration to add missing columns, enum values, and functions:
- Add `minimum_order_amount`, `daily_order_limit`, `vacation_mode`, `vacation_until`, `pickup_payment_config`, `delivery_payment_config` to `seller_profiles`
- Add `payment_pending` to `order_status` enum
- Create/replace `get_user_auth_context` function

### Step 3: Fix Config and Redeploy (I Will Do This)

- Update `supabase/config.toml` project_id
- Add `msg91-send-otp` and `msg91-verify-otp` to config
- Redeploy all edge functions

### Step 4: Verify

Test OTP send, auth flow, and profile loading after secrets are added.

## What To Do Now

**Approve this plan** and I will immediately execute Steps 2-3. In parallel, add the MSG91 secrets to Supabase so OTP works.

