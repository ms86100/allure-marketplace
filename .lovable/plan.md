

## Plan: Migrate to MSG91 OTP Widget API

### Why
The current SendOTP API requires DLT registration for custom SMS content. The OTP Widget uses MSG91's pre-registered DLT templates, bypassing this requirement. OTPs will be delivered using MSG91's default message format (without your app name), which you've confirmed is acceptable.

### Key Insight from Documentation
The React Native SDK (`@msg91comm/sendotp-react-native`) is for native mobile apps only. Since our OTP logic runs in backend functions (not client-side native code), we call the **same underlying Widget HTTP API** that the SDK uses internally. The SDK docs confirm the endpoints and request/response formats.

### Architecture (unchanged from user perspective)

```text
Frontend (useAuthPage.ts)
  │
  ├─ Send OTP ──► Edge Function ──► POST api.msg91.com/api/v5/widget/sendOtp
  │                                  Body: { identifier, widgetId, tokenAuth }
  │                                  Returns: { type: "success", reqId: "..." }
  │
  ├─ Resend  ──► Edge Function ──► POST api.msg91.com/api/v5/widget/retryOtp
  │                                  Body: { reqId, retryChannel: 11 }
  │
  └─ Verify  ──► Edge Function ──► POST api.msg91.com/api/v5/widget/verifyOtp
                                    Body: { reqId, otp }
                                    Returns: { type: "success", access_token: "jwt..." }
                                        │
                                        ▼
                                   POST api.msg91.com/api/v5/widget/verifyAccessToken
                                    Body: { access_token }
                                    Returns: verified identifier (phone)
                                        │
                                        ▼
                                   Find/create Supabase user + generate magiclink
                                   (existing logic, unchanged)
```

### Implementation Steps

**1. Add 2 new secrets**
- `MSG91_WIDGET_ID` — Your Widget ID (`3663686d7a79383832373436` from the PDF)
- `MSG91_TOKEN_AUTH` — Your Token Auth from the MSG91 OTP Widget config page

Existing `MSG91_AUTH_KEY` stays (still needed as header). `MSG91_OTP_TEMPLATE_ID` becomes unused.

**2. Rewrite `msg91-send-otp` edge function**
- Send: `POST https://api.msg91.com/api/v5/widget/sendOtp`
  - Headers: `{ authkey, content-type: application/json }`
  - Body: `{ identifier: "91XXXXXXXXXX", widgetId, tokenAuth }`
  - Response includes `reqId` — return it to frontend
- Resend: `POST https://api.msg91.com/api/v5/widget/retryOtp`
  - Body: `{ reqId, retryChannel: 11 }` (SMS channel)
  - Frontend passes the `reqId` it received from the send call

**3. Rewrite `msg91-verify-otp` edge function**
- Step 1: `POST https://api.msg91.com/api/v5/widget/verifyOtp`
  - Body: `{ reqId, otp }` — returns JWT `access_token`
- Step 2: `POST https://api.msg91.com/api/v5/widget/verifyAccessToken`
  - Body: `{ access_token }` — server-side validation, returns the verified identifier (phone number)
- Step 3: Use verified phone to find/create user + generate magiclink (existing logic stays)

**4. Update `useAuthPage.ts` (frontend hook)**
- Add `reqId` state variable
- Store `reqId` from send-otp response
- Pass `reqId` to verify-otp and resend calls (instead of just phone)
- No UI component changes needed

### Files Modified
| File | Change |
|------|--------|
| `supabase/functions/msg91-send-otp/index.ts` | Switch to Widget sendOtp/retryOtp endpoints |
| `supabase/functions/msg91-verify-otp/index.ts` | Switch to Widget verifyOtp + verifyAccessToken |
| `src/hooks/useAuthPage.ts` | Add reqId state, pass to edge function calls |

### Prerequisites
Before I implement, I need you to provide:
1. Your **Token Auth** value from the MSG91 OTP Widget config page (the token generated under "Tokens" section)

The Widget ID is already visible from your PDF: `3663686d7a79383832373436`

