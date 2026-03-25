

# Fix All Domain References: `sociva.app` / `block-eats` → `www.sociva.in`

## Overview

Replace all production domain references with `https://www.sociva.in` across config, docs, deep link tests, and privacy manifest. Internal synthetic emails (`@phone.sociva.app`, `@test.sociva.app`) stay unchanged — they are internal identifiers, not public URLs.

## Changes

### 1. `capacitor.config.ts`
- Line 30: `hostname: 'sociva.app'` → `'www.sociva.in'`
- Line 40-41: Replace `rvvctaikytfeyzkwoqxg.supabase.co` with `ywhlqsgvbkvcvqlsniad.supabase.co` (correct Cloud ref), replace `block-eats.lovable.app` with `www.sociva.in`
- Line 18: Invert logic — `const isDev = process.env.CAPACITOR_ENV === 'development'` so production is default (safety net against forgetting env var)

### 2. `codemagic.yaml`
- Lines 240, 986: `applinks:block-eats.lovable.app` → `applinks:www.sociva.in`

### 3. `PRE_SUBMISSION_CHECKLIST.md`
- Line 68: `applinks:block-eats.lovable.app` → `applinks:www.sociva.in`
- Line 92: curl URL → `https://www.sociva.in/.well-known/apple-app-site-association`

### 4. `STORE_METADATA.md`
- Line 118: `https://sociva.app/privacy-policy` → `https://www.sociva.in/privacy-policy`
- Line 121: `https://sociva.app/terms` → `https://www.sociva.in/terms`
- Line 157: `https://sociva.app/profile` → `https://www.sociva.in/help` (public, no auth)

### 5. `DEPLOYMENT.md`
- Line 136: `applinks:sociva.app` → `applinks:www.sociva.in`
- Line 272: curl URL → `https://www.sociva.in/.well-known/...`

### 6. `src/hooks/useDeepLinks.ts`
- Lines 44-45: Update comments from `sociva.app` → `www.sociva.in`

### 7. `src/test/deep-business-rules.test.ts`
- Lines 118, 121: Update test URLs from `sociva.app` → `www.sociva.in`

### 8. `native/ios/PrivacyInfo.xcprivacy`
- Populate `NSPrivacyCollectedDataTypes` with required declarations:
  - **Name** (linked to user, app functionality)
  - **Email** (linked to user, app functionality)
  - **Phone Number** (linked to user, app functionality)
  - **Precise Location** (linked to user, app functionality)
  - **Photos** (linked to user, app functionality)
  - **Device ID** (linked to user, app functionality — push token)

### 9. `package.json`
- Change `"name"` from `"vite_react_shadcn_ts"` to `"sociva"`

### Not Changed (intentional)
- `@phone.sociva.app` synthetic emails — internal auth identifiers, not public URLs
- `@test.sociva.app` test emails — same reason
- `demo@sociva.app` — reviewer email address, not a URL
- `support@sociva.app` — email address stays (email ≠ domain)

## Files Modified (9)

| File | Changes |
|---|---|
| `capacitor.config.ts` | Domain, Supabase ref, dev/prod logic |
| `codemagic.yaml` | 2 applinks references |
| `PRE_SUBMISSION_CHECKLIST.md` | applinks + curl URL |
| `STORE_METADATA.md` | Privacy, Terms, Support URLs |
| `DEPLOYMENT.md` | applinks + curl URL |
| `src/hooks/useDeepLinks.ts` | Comment URLs |
| `src/test/deep-business-rules.test.ts` | Test URLs |
| `native/ios/PrivacyInfo.xcprivacy` | Add collected data types |
| `package.json` | App name |

