

## Investigation Summary

The edge function works and MSG91 returns `{"type":"success"}` with a `request_id`, but the MSG91 SendOTP Logs panel shows "Nothing Here." This means MSG91 is accepting the HTTP request but **not actually processing it as an OTP send**. This is a known MSG91 behavior when the template ID doesn't match or the request format is wrong.

## Root Cause (most likely)

The current code uses a **GET** request. MSG91's newer OTP API versions require **POST with JSON body**. The GET endpoint may silently accept and drop requests with mismatched templates.

## Plan

### 1. Update `msg91-send-otp` edge function
- Switch from **GET** to **POST** with JSON body for the send request
- Send body: `{ template_id, mobile, otp_length: 6 }`
- Keep retry/resend as GET (that endpoint is GET-only)

### 2. Verify template ID
- Ask user to double-check the `MSG91_OTP_TEMPLATE_ID` secret value matches exactly what's shown in MSG91 dashboard (Templates section)

## Code Change

**`supabase/functions/msg91-send-otp/index.ts`** — Change the send block:

```typescript
// BEFORE (GET — silently fails)
url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${mobile}&otp_length=6`;
const response = await fetch(url, { method: "GET", headers: { authkey: authKey } });

// AFTER (POST with JSON body)
const response = await fetch("https://control.msg91.com/api/v5/otp", {
  method: "POST",
  headers: {
    authkey: authKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    template_id: templateId,
    mobile: mobile,
    otp_length: 6,
    otp_expiry: 10,
  }),
});
```

Retry/resend path stays as GET (unchanged).

### 3. User action needed
- Confirm the `MSG91_OTP_TEMPLATE_ID` secret value is correct (copy-paste from MSG91 dashboard → SendOTP → Templates → your template's ID)

