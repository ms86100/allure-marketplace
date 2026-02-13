import type { CapacitorConfig } from '@capacitor/cli';

/**
 * PRODUCTION Capacitor Configuration for Sociva App
 * 
 * USAGE:
 * 1. Rename this file to capacitor.config.ts before building for app stores
 * 2. Run `npm run build` to generate the dist folder
 * 3. Run `npx cap sync` to copy web assets to native projects
 * 4. Build in Xcode (iOS) or Android Studio (Android)
 * 
 * This configuration loads from local bundled assets (no remote server)
 */

const config: CapacitorConfig = {
  appId: 'app.sociva.community',
  appName: 'Sociva',
  webDir: 'dist',
  
  // NO server block - app loads from bundled assets
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      iosSplashResourceName: 'LaunchScreen',
      showSpinner: false,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#F97316',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  
  // iOS-specific configuration
  ios: {
    scheme: 'sociva',
    contentInset: 'automatic',
  },
  
  // Android-specific configuration
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
