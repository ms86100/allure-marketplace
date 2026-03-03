

# ROOT CAUSE ANALYSIS — iOS Push Registration Failure

## THE EVIDENCE (from runtime logs)

Here is **every single log** ever recorded for user `20cda5a7`:

| # | Timestamp | Message | Key Data |
|---|-----------|---------|----------|
| 1 | 20:11:35 | `appStateChange active` | `regState: idle, hasToken: false` |
| 2 | 20:13:54 | `appStateChange active` | `regState: idle, hasToken: false` |
| 3 | 20:16:01 | `appStateChange active` | `regState: idle, hasToken: false` |
| 4 | 20:17:22 | `appStateChange active` | `regState: idle, hasToken: false` |
| 5 | 20:18:04 | `appStateChange active` | `regState: idle, hasToken: false` |
| 6 | 20:19:14 | `appStateChange active` | `regState: idle, hasToken: false` |
| 7 | 20:19:34 | `appStateChange active` | `regState: idle, hasToken: false` |
| 8 | 20:52:28 | `attemptRegistration — attempt 1/3` | `platform: ios` |

**Yet the DB shows a valid token**: `fZYG2oOwO…` updated at `20:52:30` — 2 seconds after log #8.

**Critical observation**: There are **zero** logs for:
- `Push stage on login: …`
- `reconcileRuntimeToken …`  
- `requestPermissions result: …`
- `Permission not granted …`
- `Registration FAILED …`
- `watchdog expired …`
- Any safety-net or hard-recovery log
- Any `registrationError` event

---

## ROOT CAUSE

**The user's device is running an OLD native build that does NOT contain the current JavaScript code.**

### Proof

1. **The code at lines 826-898** logs `Push stage on login: ${stage}` immediately on login. This log **does not exist** in the database. The login flow never executed the current code.

2. **The code at lines 695-709** logs `Resume prelog reconcile crashed` or succeeds with `reconcileRuntimeToken success`. Neither log exists. The resume handler never executed the current reconciliation code.

3. **The code at lines 770-782** logs `Resume safety-net: delayed reconcile attempt (5s)`. This log **does not exist**. The safety-net code never ran.

4. **The code at lines 786-794** logs `Resume hard-recovery: forcing attemptRegistration from idle+no-token`. This log **does not exist**. The hard-recovery code never ran.

5. **Between 20:11 and 20:19**, there are **7 resume events** — all show `regState: idle, hasToken: false`. In the current code, every single one of these would trigger `reconcileRuntimeToken`, then `attemptRegistration`, then `Resume hard-recovery`. None of those logs exist. The code running on the device is an older version that only logs `appStateChange active` and does nothing else on resume.

6. **At 20:52:28**, `attemptRegistration` finally runs and **succeeds** — the DB token updates 2 seconds later at 20:52:30. But no `reconcileRuntimeToken success` log, no `✓ Valid token obtained` log, no `Token saved successfully` log. This means even the `attemptRegistration` code is a prior version that lacks the current `pushLog` calls inside `handleValidToken`.

### Why `hasToken` remains `false` despite DB having a token

The token at `fZYG2oOwO…` was saved to the DB at 20:52:30 by whatever older code ran `attemptRegistration`. But because the user's app is running old JS that lacks the reconciliation logic, on subsequent resumes the in-memory `tokenRef.current` is never populated (the hook re-mounts with `useState<string | null>(null)` and the old code never calls `reconcileRuntimeToken` to restore it).

### Why it appears intermittent

- When the app **cold-starts** and the login flow runs: the old code's `attemptRegistration` sometimes succeeds (log #8 proves this — it saved a token).
- When the app **resumes from background**: the old code's resume handler only logs `appStateChange active` and does nothing to recover the token — so `hasToken` stays `false`.

### Why the backend shows "Push sent=0" for some users

User `76d09142` has **zero** device_tokens rows. Their device is also running old code that failed the initial registration and has no recovery path. The queue processor correctly finds zero tokens and logs `Push sent=0`.

---

## SINGLE ROOT CAUSE STATEMENT

**ROOT CAUSE**: The iOS device is running a **stale JavaScript bundle** that does not contain the reconciliation, safety-net, or hard-recovery code added over the past 2 days. The `capacitor.config.ts` points `server.url` to the live preview URL (`https://b3f6efce-…lovableproject.com`), but the app is **not loading the updated code** — it is serving a cached/stale version.

**WHY IT BREAKS**: The old code has no `reconcileRuntimeToken` call on resume, no safety-nets, no hard-recovery. It only logs `appStateChange active` and exits. The in-memory token is never restored after hook re-mount.

**PROOF**: The current codebase contains 15+ `pushLog` calls (reconcile, safety-net, hard-recovery, permission checks) that should fire on every resume. Zero of these logs exist in the database across 7 resume events. Only the primitive `appStateChange active` log exists — proving the running code predates all fixes.

**WHY IT APPEARS INTERMITTENT**: Cold-start login occasionally triggers `attemptRegistration` (log #8 at 20:52:28, which saved a token). But background resume never recovers the token because the recovery code doesn't exist in the running bundle.

**WHY BACKEND SHOWS "Push sent=0"**: For users whose initial registration also failed (like `76d09142`), there are zero rows in `device_tokens`, so the queue processor finds no tokens to send to.

---

## WHAT MUST HAPPEN (not a code fix — a deployment action)

The app must actually load the current JavaScript. Either:

1. **Force-reload the WebView** — kill the app completely (swipe-away from app switcher), reopen it, and confirm the WebView fetches fresh JS from the preview URL (not a cached bundle). Check if iOS WKWebView is aggressively caching the remote URL.

2. **Verify the preview URL is serving current code** — open `https://b3f6efce-9b8e-4071-b39d-b038b9b1adf4.lovableproject.com` in a desktop browser and check if the `usePushNotifications` source contains `reconcileRuntimeToken`. If it does, the problem is iOS WKWebView cache. If it doesn't, the deployment hasn't propagated.

3. **After confirming fresh code loads** — resume the app and check `push_logs` for `reconcileRuntimeToken` entries. If they appear, the fix is working. If they don't, the WebView is still serving stale JS.

