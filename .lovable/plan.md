
Goal: make this project work end-to-end by fixing backend parity, secrets, and config drift between this project and the source project.

1. Confirm the real blockers
- OTP is failing because `msg91-send-otp` currently returns `{"error":"OTP service not configured"}`.
- Only one runtime secret exists right now: `LOVABLE_API_KEY`.
- Runtime logs also show database drift:
  - `seller_profiles.minimum_order_amount does not exist`
  - `invalid input value for enum order_status: "payment_pending"`
- Current schema shows `seller_profiles.min_order_amount`, which does not match the copied app code expecting `minimum_order_amount`.

2. Recreate secrets first
These cannot be copied automatically from the other project’s private environment. They must be re-added securely in this project’s Supabase Edge Function secrets or via `admin_settings`.

Minimum required to unblock login:
- `MSG91_AUTH_KEY`
- `MSG91_WIDGET_ID`
- `MSG91_TOKEN_AUTH`

Also needed for full app parity:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `GOOGLE_MAPS_API_KEY`
- APNS secrets for iOS push:
  - `APNS_KEY_P8`
  - `APNS_KEY_ID`
  - `APNS_TEAM_ID`
  - `APNS_BUNDLE_ID`
- FCM / Firebase server-side secret used by notifications

3. Sync backend schema to the copied app
Create a focused migration that brings this database up to what the copied frontend expects, without blindly replaying everything.
Priority fixes:
- Add/alias missing seller columns expected by the UI:
  - `minimum_order_amount`
  - `daily_order_limit`
  - `pickup_payment_config`
  - `delivery_payment_config`
  - `vacation_mode`
  - `vacation_until`
- Add missing enum value:
  - `order_status = 'payment_pending'`
- Seed/update any status-flow config tables required by live activity and order workflow
- Create or replace `get_user_auth_context(_user_id uuid)` to match the source project behavior

4. Sync edge/backend configuration
- Fix `supabase/config.toml` so it matches this project’s Supabase ref, not the source project’s old ref
- Verify OTP and payment edge functions are present and configured consistently with source:
  - `msg91-send-otp`
  - `msg91-verify-otp`
  - `create-razorpay-order`
  - `confirm-razorpay-payment`
  - notification-related functions

5. Copy only safe config/assets from source
Safe to copy:
- public client config files
- non-secret platform config
- Firebase/iOS client config files if still missing or outdated
Not safe to copy automatically:
- private API keys
- APNS private key material
- Razorpay secret
- MSG91 private credentials

6. End-to-end verification sequence
After schema + config + secrets are aligned:
- Test `/auth`
- Send OTP successfully
- Verify OTP/login completes
- Confirm profile hydration no longer hangs on “Loading your profile...”
- Check core routes after login
- Validate payment config reads correctly
- Validate notifications/maps degrade gracefully if secrets are still pending

7. Recommended implementation order
Phase A: secrets
Phase B: database migration for schema drift
Phase C: config and edge-function parity
Phase D: browser verification
Phase E: remaining route-by-route cleanup if any screen still depends on missing source data

Technical details
- The main issue is not frontend copy completeness anymore; it is backend parity.
- “Copy all config and keys” splits into two categories:
  - copyable: code, migrations, public config, assets
  - not copyable: private secrets, which must be re-entered securely
- The current errors point to backend mismatch, not a login-screen UI bug.
- OTP cannot work until MSG91 secrets exist in this target project.
- Even with OTP fixed, login/profile will still fail until schema drift is resolved.

Expected outcome
After these steps, the auth flow should work from the normal preview route, OTP should send, login should complete, and the copied application should stop failing on missing column / enum / auth-context dependencies.
