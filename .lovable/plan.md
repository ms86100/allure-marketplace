

## Bulletproof UPI Intent Fix for Razorpay in Capacitor WebView

### What's Wrong Now
The current code has `config.display.blocks` with UPI intent instruments — but this alone **does not work in a Capacitor WebView**. Per Razorpay's official docs, WebView-based checkout requires an additional flag: **`webview_intent: true`** passed at the top level of the checkout options. Without it, Razorpay's JS SDK detects it's inside a WebView and disables intent flows entirely, falling back to generic UPI categories.

Additionally, the `apps` identifiers should include `'gpay'` (Razorpay's documented alias) alongside `'google_pay'` for maximum compatibility, and `'any'` should be added on Android to catch other installed UPI apps (BHIM, Cred, etc.).

### The Fix — 3 Layers

**Layer 1: `webview_intent: true` flag** (the missing critical piece)
Add to the top-level Razorpay options object. This is the single flag that tells Razorpay's SDK to enable intent-based UPI inside a WebView/Capacitor context.

**Layer 2: Broader app coverage in instruments**
- Add `gpay` as an alias for `google_pay` (Razorpay docs list `gpay` as the official identifier)
- Add an `any` instrument to catch all other installed UPI apps on Android

**Layer 3: Capacitor deep link handling**
The `capacitor.config.ts` already has `*.razorpay.com` and `*.razorpay.in` in `allowNavigation`. For Android, the WebView needs to handle `upi://` and `intent://` scheme URLs. This requires adding `androidAllowIntentUrls: true` to the Capacitor server config so the native WebView allows UPI app deep links.

### Files Changed

| File | Change |
|---|---|
| `src/hooks/useRazorpay.ts` | Add `webview_intent: true` to options; update instruments to use `gpay` + add `any` catch-all |
| `capacitor.config.ts` | Add `allowIntentUrls: true` to Android server config for `upi://` and `intent://` scheme handling |

### Detailed Changes

**`src/hooks/useRazorpay.ts`** — inside `razorpayOptions` object:
```typescript
const razorpayOptions = {
  key: data.razorpay_key_id,
  // ... existing fields ...
  
  // CRITICAL: Enable UPI intent inside Capacitor WebView
  webview_intent: true,
  
  config: {
    display: {
      blocks: {
        upi: {
          name: 'Pay via UPI',
          instruments: [
            { method: 'upi', flows: ['intent'], apps: ['gpay'] },
            { method: 'upi', flows: ['intent'], apps: ['phonepe'] },
            { method: 'upi', flows: ['intent'], apps: ['paytm'] },
            { method: 'upi', flows: ['intent'], apps: ['any'] },
          ],
        },
      },
      sequence: ['block.upi'],
      preferences: {
        show_default_blocks: true,
      },
    },
  },
  // ... rest unchanged
};
```

**`capacitor.config.ts`** — Android config:
```typescript
android: {
  allowMixedContent: !isProduction,
  captureInput: true,
  webContentsDebuggingEnabled: !isProduction,
  // Allow UPI intent:// and upi:// deep links from Razorpay
  allowIntentUrls: true,
},
```

### Why This Is Bulletproof
1. **`webview_intent: true`** — Razorpay's documented requirement for WebView contexts; without it, intent flows are silently disabled
2. **`gpay` not `google_pay`** — matches Razorpay's official app identifier in their docs
3. **`any` instrument** — catches all installed UPI apps beyond the big 3, improving coverage on Android
4. **`allowIntentUrls`** — lets the Android WebView handle `intent://` scheme URLs that Razorpay generates for app switching
5. **`show_default_blocks: true`** — Cards/Netbanking/Wallets remain accessible as fallback
6. **Backward compatible** — if merchant doesn't have UPI Intent enabled, Razorpay silently falls back to default view

~8 lines changed across 2 files. Run `npx cap sync` after to apply native config.

