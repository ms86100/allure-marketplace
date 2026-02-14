

## Production-Ready iOS and TestFlight Plan for Sociva

### Current State Assessment

Your app already has a solid Capacitor foundation. Here is what is already working and what needs to be fixed or added.

**Already Complete:**
- Capacitor core, iOS, Android, and all plugins installed and configured
- Deep linking handler with custom URL scheme (`sociva://`)
- Push notifications (FCM HTTP v1 backend)
- Splash screen, status bar, keyboard plugins
- Safe area CSS utilities for notch devices
- Production build optimizations (minification, console stripping, code splitting)
- App icons in all required sizes
- Privacy Policy, Terms of Service, and Account Deletion pages
- Codemagic CI/CD pipeline
- Viewport configured with `viewport-fit=cover`

**No Apple Sign-In needed:** Your app uses email/password authentication only. Apple only requires "Sign in with Apple" if you offer other social login options (Google, Facebook, etc.). Since you don't, you are compliant.

---

### What Needs to Be Done

#### 1. Consolidate Capacitor Config (Eliminate Confusion)

Currently you have two config files (`capacitor.config.ts` and `capacitor.config.production.ts`) which is error-prone. We will merge them into a single `capacitor.config.ts` that uses environment detection.

Changes:
- Single `capacitor.config.ts` that checks `process.env.NODE_ENV` or a build flag
- Production mode: no `server` block, `allowMixedContent: false`, `webContentsDebuggingEnabled: false`
- Development mode: live reload server URL
- Add `androidScheme: 'https'` to the server config for proper HTTPS handling on iOS
- Add `allowNavigation` to restrict WebView navigation to your production domains only
- Delete `capacitor.config.production.ts`

#### 2. Fix Stale Bundle ID References

Multiple documentation files reference the old `app.greenfield.community` bundle ID and `blockeats` branding. These will be updated to `app.sociva.community` and `Sociva`:

- `PRE_SUBMISSION_CHECKLIST.md` -- update bundle ID, demo account references, deep link examples
- `codemagic.yaml` -- update all `bundle_identifier`, `BUNDLE_ID`, keystore references from `greenfield` to `sociva`
- `CODEMAGIC_SETUP.md` -- update keystore name references

#### 3. Add PWA OAuth Safeguard

Add `navigateFallbackDenylist: [/^\/~oauth/]` to the VitePWA config in `vite.config.ts`. This prevents the service worker from caching OAuth callback routes, which is required for future-proofing if social login is ever added.

#### 4. Add Version Management

Add a `version` field to `capacitor.config.ts` and create a simple version tracking approach:
- `package.json` version updated to `1.0.0`
- Capacitor config references this version

#### 5. iOS-Specific Production Hardening

Update `capacitor.config.ts` iOS section:
- Add `preferredContentMode: 'mobile'` for consistent rendering
- Ensure `contentInset: 'automatic'` stays (already set)
- The custom scheme `sociva` is already configured for deep links

#### 6. Update Production Checklist

Rewrite `PRE_SUBMISSION_CHECKLIST.md` with correct Sociva branding, accurate bundle IDs, and updated instructions aligned with the current architecture.

---

### Files to Modify
- `capacitor.config.ts` -- consolidate dev/prod into single smart config
- `vite.config.ts` -- add `navigateFallbackDenylist`
- `package.json` -- set version to `1.0.0`
- `PRE_SUBMISSION_CHECKLIST.md` -- fix all stale references
- `codemagic.yaml` -- fix bundle IDs and keystore names
- `CODEMAGIC_SETUP.md` -- fix keystore name references

### Files to Delete
- `capacitor.config.production.ts` -- no longer needed after consolidation

### No Database Changes Required

---

### What You Still Need to Do Externally (After Implementation)

These are steps that cannot be done inside Lovable:

1. Export project to GitHub and clone locally
2. Run `npx cap add ios` and `npx cap sync ios`
3. Open in Xcode (`npx cap open ios`)
4. In Xcode Signing and Capabilities:
   - Set your Apple Developer Team
   - Add Push Notifications capability
   - Add Associated Domains capability (`applinks:block-eats.lovable.app`)
   - Add Background Modes (Remote notifications)
5. Add `GoogleService-Info.plist` from Firebase Console to `ios/App/App/`
6. Replace `TEAM_ID` in `public/.well-known/apple-app-site-association` with your actual Apple Team ID
7. Archive and upload to App Store Connect
8. Submit to TestFlight for testing

