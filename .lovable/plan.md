

# Fix: Razorpay Domain Check Failing in Production Mobile App

## Root Cause

Your `capacitor.config.ts` has `hostname: 'www.sociva.in'` in **dev mode only**. In production mode, the WebView defaults to `https://localhost` — which Razorpay rejects because `localhost` is not in your registered domains.

```text
Dev mode:   hostname: 'www.sociva.in'  → Razorpay sees sociva.in ✅
Prod mode:  hostname: (missing)        → Razorpay sees localhost  ❌
```

## Fix

**File:** `capacitor.config.ts`

Add `hostname: 'www.sociva.in'` to the production server config block (line 37-46):

```typescript
...(!isDev && {
  server: {
    hostname: 'www.sociva.in',    // ← ADD THIS
    androidScheme: 'https',
    allowNavigation: [
      'ywhlqsgvbkvcvqlsniad.supabase.co',
      'www.sociva.in',
      '*.razorpay.com',
      '*.razorpay.in',
    ],
  },
}),
```

This makes the production WebView report its origin as `https://www.sociva.in` — matching your Razorpay dashboard registration. No other files change.

## After This

Rebuild and sync: `npm run build && npx cap sync`

