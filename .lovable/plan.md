

## Credential Audit & Admin Credential Manager

### Current Credential Inventory

Here is every external credential the application depends on:

| # | Integration | Credential | Current Location | Hardcoded? |
|---|-------------|-----------|-----------------|------------|
| 1 | **Razorpay** | Key ID (`razorpay_key_id`) | `admin_settings` table | No (DB) |
| 2 | **Razorpay** | Key Secret (`razorpay_key_secret`) | `admin_settings` table + env fallback | Partially |
| 3 | **Google Maps** | API Key | Hardcoded in `src/hooks/useGoogleMaps.ts` line 4 | **Yes** |
| 4 | **MSG91 (OTP)** | Auth Key | Edge function env secret `MSG91_AUTH_KEY` | Env secret |
| 5 | **MSG91 (OTP)** | Widget ID | Edge function env secret `MSG91_WIDGET_ID` | Env secret |
| 6 | **MSG91 (OTP)** | Token Auth | Edge function env secret `MSG91_TOKEN_AUTH` | Env secret |
| 7 | **MSG91 (OTP)** | OTP Template ID | Edge function env secret `MSG91_OTP_TEMPLATE_ID` | Env secret |
| 8 | **Firebase (FCM)** | Service Account JSON | Edge function env secret `FIREBASE_SERVICE_ACCOUNT` | Env secret |
| 9 | **APNs (iOS Push)** | Key P8 | Edge function env secret `APNS_KEY_P8` | Env secret |
| 10 | **APNs (iOS Push)** | Key ID | Edge function env secret `APNS_KEY_ID` | Env secret |
| 11 | **APNs (iOS Push)** | Team ID | Edge function env secret `APNS_TEAM_ID` | Env secret |
| 12 | **APNs (iOS Push)** | Bundle ID | Edge function env secret `APNS_BUNDLE_ID` | Env secret |

### What Needs to Change

**Problem**: Google Maps API key is hardcoded in the frontend. MSG91, Firebase, and APNs credentials are stored as edge function environment secrets — they work but can't be updated from the admin panel without redeployment.

**Solution**: Migrate all credentials to the `admin_settings` database table (which already exists and is used by Razorpay). Edge functions will read from `admin_settings` first, falling back to env secrets for backward compatibility.

### Implementation Plan

#### 1. Add all credential configs to `admin_settings` table
No schema change needed — the `admin_settings` table already has `key`, `value`, `is_active`, `description` columns. We just need to ensure edge functions read from it.

#### 2. Fix Google Maps hardcoded key
- Update `src/hooks/useGoogleMaps.ts` to fetch `google_maps_api_key` from `admin_settings` (via the existing `system_settings`/`admin_settings` query pattern) instead of the hardcoded value
- Use the hardcoded value as a fallback until the DB value is set

#### 3. Update edge functions to read from `admin_settings` first
Update these edge functions to check `admin_settings` before falling back to `Deno.env.get()`:
- `msg91-send-otp` — read `msg91_auth_key`, `msg91_widget_id`, `msg91_token_auth`
- `msg91-verify-otp` — same keys
- `send-push-notification` — read `firebase_service_account`, `apns_key_p8`, `apns_key_id`, `apns_team_id`, `apns_bundle_id`

#### 4. Create new Admin "Credentials" section
- Add a `credentials` tab to `AdminSidebarNav.tsx` under the "System" group (with a Key icon)
- Create `src/components/admin/CredentialsManager.tsx` with sub-tabs:
  - **Payment** — Razorpay Key ID, Key Secret
  - **SMS / OTP** — MSG91 Auth Key, Widget ID, Token Auth, Template ID
  - **Push Notifications** — Firebase Service Account JSON, APNs Key P8, Key ID, Team ID, Bundle ID
  - **Google Maps** — API Key
- Each tab shows the same card-based UI as `ApiKeySettings` (input, save, active toggle, masked values)
- Remove `ApiKeySettings` from the "System > Settings" tab (it moves to the new Credentials section)

#### 5. Credential storage details
- **Table**: `admin_settings` (existing)
- **Columns**: `key` (text, primary), `value` (text), `is_active` (boolean), `description` (text), `created_at`, `updated_at`
- **Keys used**: `razorpay_key_id`, `razorpay_key_secret`, `google_maps_api_key`, `msg91_auth_key`, `msg91_widget_id`, `msg91_token_auth`, `msg91_otp_template_id`, `firebase_service_account`, `apns_key_p8`, `apns_key_id`, `apns_team_id`, `apns_bundle_id`

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/admin/CredentialsManager.tsx` | **Create** — Tabbed credential management UI |
| `src/components/admin/AdminSidebarNav.tsx` | Add `credentials` nav item |
| `src/pages/AdminPage.tsx` | Add credentials tab rendering, remove ApiKeySettings from settings |
| `src/hooks/useGoogleMaps.ts` | Fetch API key from `admin_settings` instead of hardcoded |
| `supabase/functions/msg91-send-otp/index.ts` | Read credentials from DB first |
| `supabase/functions/msg91-verify-otp/index.ts` | Read credentials from DB first |
| `supabase/functions/send-push-notification/index.ts` | Read credentials from DB first |

### Safety Guarantees
- All edge functions fall back to existing env secrets if DB values are not set — zero breakage
- Google Maps falls back to the current hardcoded key if no DB value exists
- Razorpay already works via `admin_settings` — no change needed
- RLS on `admin_settings` already restricts access to admins only

