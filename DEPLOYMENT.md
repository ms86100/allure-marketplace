# BlockEats / Greenfield Community - Production Deployment Guide

## Prerequisites

Before deploying to app stores, ensure you have:

### For iOS (App Store)
- Mac with Xcode 15+ installed
- Apple Developer Account ($99/year)
- App Store Connect access
- Push notification certificate (APNs)

### For Android (Google Play)
- Android Studio installed
- Google Play Developer Account ($25 one-time)
- Firebase project for push notifications
- Keystore for signing the app

---

## Step 1: Prepare the Codebase

### 1.1 Switch to Production Capacitor Config

```bash
# Backup development config
mv capacitor.config.ts capacitor.config.dev.ts

# Use production config (no remote server)
mv capacitor.config.production.ts capacitor.config.ts
```

### 1.2 Update Deep Linking Configuration

#### iOS (Apple App Site Association)
Edit `public/.well-known/apple-app-site-association`:
- Replace `TEAM_ID` with your Apple Developer Team ID (found in Apple Developer Portal)

#### Android (Asset Links)
Edit `public/.well-known/assetlinks.json`:
- Replace `SHA256_FINGERPRINT_PLACEHOLDER` with your app's signing certificate fingerprint
- Get fingerprint: `keytool -list -v -keystore your-release-key.keystore`

### 1.3 Configure Push Notifications

#### iOS
1. Create APNs Key in Apple Developer Portal
2. Upload to your push notification service

#### Android
1. Create Firebase project
2. Download `google-services.json`
3. Place in `android/app/`

---

## Step 2: Build the Web App

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Verify the dist folder was created
ls -la dist/
```

---

## Step 3: Sync with Native Projects

```bash
# Sync web assets to native projects
npx cap sync

# This copies the dist/ folder to:
# - ios/App/App/public/
# - android/app/src/main/assets/public/
```

---

## Step 4: Build for iOS

### 4.1 Open in Xcode
```bash
npx cap open ios
```

### 4.2 Configure Signing
1. Select the project in navigator
2. Go to "Signing & Capabilities"
3. Select your Team
4. Ensure bundle ID matches: `app.lovable.b3f6efce9b8e4071b39db038b9b1adf4`

### 4.3 Add Required Capabilities
- Push Notifications
- Associated Domains (add: `applinks:block-eats.lovable.app`)
- Background Modes (Remote notifications)

### 4.4 Build Archive
1. Select "Any iOS Device" as target
2. Product → Archive
3. Once complete, click "Distribute App"
4. Choose "App Store Connect"

### 4.5 App Store Submission
1. Log into App Store Connect
2. Create new app listing
3. Fill in metadata, screenshots, privacy policy URL
4. Submit for review

---

## Step 5: Build for Android

### 5.1 Open in Android Studio
```bash
npx cap open android
```

### 5.2 Generate Signed APK/Bundle
1. Build → Generate Signed Bundle/APK
2. Choose "Android App Bundle" for Play Store
3. Create or select your keystore
4. Select "release" build variant
5. Build

### 5.3 Google Play Submission
1. Log into Google Play Console
2. Create new app
3. Upload AAB file
4. Complete store listing, content rating, pricing
5. Submit for review

---

## App Store Requirements Checklist

### ✅ Already Implemented
- [x] Privacy Policy page (`/privacy-policy`)
- [x] Terms of Service page (`/terms`)
- [x] Account Deletion feature (Profile → Delete Account)
- [x] Demo account for reviewers (`demo@blockeats.app` / `DemoReview2026!`)
- [x] Deep linking support (Universal Links / App Links)
- [x] Push notification capability
- [x] Offline support banner
- [x] Error boundary for crash handling

### 📋 Required Screenshots (You need to create)
- iPhone 6.7" (1290 x 2796 px)
- iPhone 6.5" (1242 x 2688 px)
- iPhone 5.5" (1242 x 2208 px)
- iPad Pro 12.9" (2048 x 2732 px)
- Android Phone (1080 x 1920 px minimum)
- Android Tablet (1200 x 1920 px minimum)

### 📋 Required App Store Metadata
- App name: Greenfield Community
- Subtitle: Community Marketplace
- Keywords: community, marketplace, homemade food, local, neighbors
- Description (4000 chars max)
- What's New (for updates)
- Support URL
- Marketing URL (optional)

---

## Environment Configuration

### Production Environment Variables
The app uses these environment variables (already configured):
- `VITE_SUPABASE_URL` - Backend API URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Public API key

### Razorpay Configuration
Configure in Admin Panel → Settings → API Configuration:
- Razorpay Key ID (live key for production)
- Razorpay Key Secret

---

## Testing Before Submission

### Test Checklist
- [ ] App launches without crash
- [ ] Login/signup works
- [ ] Browse sellers and products
- [ ] Add to cart and checkout
- [ ] UPI payment flow (with test mode)
- [ ] Push notifications received
- [ ] Offline banner appears when no network
- [ ] Deep links open correct pages
- [ ] Account deletion works
- [ ] Demo account can access app

---

## Common Issues & Solutions

### iOS: App rejected for not working
- Ensure the production config is used (no server block)
- Verify `dist/` folder is synced with `npx cap sync`

### Android: Signing issues
- Use the same keystore for all builds
- Never lose your keystore or you can't update the app

### Push notifications not working
- Verify APNs certificate is valid (iOS)
- Check google-services.json is in correct location (Android)
- Ensure device token is being registered

### Deep links not working
- Verify AASA/assetlinks.json are accessible via HTTPS
- Check Team ID and SHA256 fingerprints are correct
- Wait up to 24 hours for Apple/Google to cache files

---

## Support

For issues with the app, contact your development team.
For Lovable platform issues, visit: https://docs.lovable.dev/
