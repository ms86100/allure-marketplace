import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.b3f6efce9b8e4071b39db038b9b1adf4',
  appName: 'BlockEats',
  webDir: 'dist',
  server: {
    url: 'https://b3f6efce-9b8e-4071-b39d-b038b9b1adf4.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
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
  },
};

export default config;
