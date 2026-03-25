

# App Store / Play Store Production Readiness Audit — Round 3

## Issue 1: Auth Page Legal Links Use `href="#/terms"` — Broken in Native WebView

**Severity: P0 — Rejection Risk**

**Evidence** — `src/pages/AuthPage.tsx` lines 167-168:
```tsx
<a href="#/terms" target="_blank" className="text-primary underline">Terms & Conditions</a>
<a href="#/privacy-policy" target="_blank" className="text-primary underline">Privacy Policy</a>
```

These links use `href="#/terms"` with `target="_blank"`. In a Capacitor WebView, `target="_blank"` opens the system browser, but `#/terms` is a hash-based URL — it resolves to the **current page URL + #/terms**, NOT to the app's `/terms` route (which uses React Router's `BrowserRouter`, not `HashRouter`).

**Scenario**: User taps "Terms & Conditions" on the auth page → system browser opens with `https://www.sociva.in/#/terms` → 404 or blank page (the web host doesn't serve hash routes). Apple reviewer sees broken legal links on the signup page.

**App Store Risk**: Guideline 5.1.2 requires accessible Terms and Privacy links during registration. Broken links = rejection.

**Root Cause**: Mixing hash-based href with a non-hash router. Should use React Router `<Link>` or proper absolute URLs.

---

## Issue 2: OTP Edge Functions Have No Rate Limiting — SMS Abuse Vector

**Severity: P1 — Security / Financial Risk**

**Evidence**: `supabase/functions/msg91-send-otp/index.ts` has zero rate limiting. No `checkRateLimit` import. No IP or phone-based throttling. The function accepts unauthenticated requests (no JWT required — it's the login flow).

Compare with `delete-user-account/index.ts` which correctly imports `checkRateLimit` (line 2) and enforces 3/hour.

**Scenario**: Attacker scripts POST requests to `msg91-send-otp` with random phone numbers → thousands of SMS sent → MSG91 bill spikes to hundreds of dollars → potential account suspension by MSG91 → all users locked out of auth.

**App Store Risk**: Not a direct rejection cause, but a production stability risk. If MSG91 suspends the account during Apple review, reviewers can't log in → rejection.

**Root Cause**: Rate limiting was added to other edge functions but missed on OTP endpoints.

---

## Issue 3: Store Metadata Says "In-App Purchases" but App Uses External Razorpay Payment

**Severity: P0 — Rejection Risk (Apple Guideline 3.1.1)**

**Evidence** — `STORE_METADATA.md` line 171:
```
- Does the app allow purchases? **Yes** (in-app purchases for services and products)
```

The term "in-app purchases" has a specific meaning to Apple — it refers to Apple's IAP system (StoreKit). Sociva uses Razorpay (external payment processor) for physical goods and services. This is LEGAL under Guideline 3.1.3(e) (physical goods/services), but the metadata wording "in-app purchases" may trigger automated flagging.

Additionally, `CartPage.tsx` line 333 correctly states: "Payments are processed by third-party providers and are not covered by Apple" — but the age rating questionnaire contradicts this by calling them "in-app purchases."

**Scenario**: Apple's automated system flags the "in-app purchases" declaration → reviewer checks for StoreKit integration → finds none → flags as circumventing IAP → rejection or inquiry.

**App Store Risk**: Guideline 3.1.1 violation if Apple interprets "in-app purchases" literally. Should be reworded to "purchases for physical goods and services."

---

## Issue 4: `delete-user-account` Deletes `chat_messages` by Both `sender_id` AND `receiver_id` — Destroys Other Users' Chat History

**Severity: P1 — Data Integrity / GDPR Compliance**

**Evidence** — `supabase/functions/delete-user-account/index.ts` lines 54-55:
```ts
{ table: 'chat_messages', column: 'sender_id' },
{ table: 'chat_messages', column: 'receiver_id' },
```

When User A deletes their account, ALL chat messages where they are the receiver are deleted. This includes messages SENT by User B (the seller or buyer). User B loses their copy of the conversation.

**Scenario**: Buyer deletes account → all seller's messages to that buyer vanish → seller loses order communication records → potential dispute evidence destroyed.

**Root Cause**: Deletion uses `receiver_id` match, which sweeps messages authored by OTHER users.

**Consequence**: Data integrity violation. Seller's own messages disappear without consent. Under GDPR, you should anonymize rather than delete data authored by other parties.

---

## Issue 5: `msg91-verify-otp` Creates User with Hardcoded `name: "User"` and Empty `flat_number`/`block`

**Severity: P2 — UX / Data Quality**

**Evidence** — `supabase/functions/msg91-verify-otp/index.ts` lines 116-117:
```ts
{ id: userId, email: syntheticEmail, phone: fullPhone, name: "User", flat_number: "", block: "" }
```

Every new user starts with `name: "User"`. If the onboarding flow doesn't force a name update, sellers see orders from "User" with no identifiable name. The `flat_number: ""` and `block: ""` may also cause issues with delivery address validation or society verification flows that check for non-empty values.

**Scenario**: New user registers → skips profile editing → places order → seller sees "User" as buyer name → confusion, potential delivery failure.

**Root Cause**: Profile bootstrapping uses placeholder values without enforcing completion.

---

## Issue 6: `msg91-verify-otp` Uses `generateLink({ type: "magiclink" })` — Token Reuse Window

**Severity: P1 — Security Risk**

**Evidence** — `supabase/functions/msg91-verify-otp/index.ts` lines 130-141:
```ts
const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
  type: "magiclink",
  email: userEmail,
});
```

The magic link token hash is returned directly to the client (line 144). If an attacker intercepts this response (MITM, compromised network), they can use the `token_hash` to establish a session for that user. The token doesn't expire immediately — it has a configurable lifespan (default: 1 hour in Supabase).

Unlike a standard OTP flow where the secret stays server-side, here the session token is transmitted to the client in plaintext JSON. While HTTPS protects in transit, any client-side logging, analytics, or error tracking that captures response bodies would leak this token.

**App Store Risk**: Not a rejection cause, but a security architecture concern for production.

---

## Issue 7: No OTP Attempt Limiting on Verify Endpoint — Brute Force Possible

**Severity: P1 — Security**

**Evidence**: `supabase/functions/msg91-verify-otp/index.ts` has no rate limiting. With 4-digit OTPs, there are only 10,000 possible values. An attacker can brute-force by sending rapid requests with the same `reqId` and all possible OTP values.

MSG91's own API may have rate limiting, but the edge function doesn't enforce it independently. If MSG91's limit is generous (e.g., 10 attempts), it may not be enough for a 4-digit code space.

**Scenario**: Attacker obtains a victim's phone number → triggers `send-otp` → brute-forces `verify-otp` with all 4-digit combinations → gains account access.

**Root Cause**: No rate limiting on the verify endpoint. MSG91 may return error code 707 ("max attempt") but this depends on MSG91's internal limits, not application-level enforcement.

---

## Summary Table

| # | Issue | Severity | Type | Action |
|---|---|---|---|---|
| 1 | Auth page legal links use `#/terms` — broken in native | **P0** | Code fix | Use `<Link>` or absolute URL |
| 2 | OTP send/verify endpoints have no rate limiting | **P1** | Code fix | Add `checkRateLimit` |
| 3 | Metadata says "in-app purchases" — Apple IAP flag risk | **P0** | Metadata fix | Reword to "physical goods purchases" |
| 4 | Account deletion destroys other users' chat messages | **P1** | Code fix | Anonymize instead of delete by receiver_id |
| 5 | New users created with `name: "User"` placeholder | **P2** | UX review | Force name during onboarding |
| 6 | Magic link token returned to client — interception window | **P1** | Architecture | Review token handling |
| 7 | No brute-force protection on OTP verify endpoint | **P1** | Code fix | Add rate limiting |

Items 1, 2, 3, 4, 7 are directly fixable. Items 5 and 6 require architectural decisions.

