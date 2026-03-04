import { useState } from 'react';
import { Bell, X, ExternalLink } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { usePushNotifications } from '@/contexts/PushNotificationContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const DISMISSED_KEY = 'notif_banner_dismissed';

export function EnableNotificationsBanner() {
  const { permissionStatus, requestFullPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) === '1'
  );
  const [loading, setLoading] = useState(false);
  const [failedSilently, setFailedSilently] = useState(false);

  if (!Capacitor.isNativePlatform()) return null;
  if (permissionStatus === 'granted') return null;
  if (dismissed && permissionStatus === 'prompt' && !failedSilently) return null;

  // If denied, show "Open Settings" variant
  if (permissionStatus === 'denied' || failedSilently) {
    const openSettings = async () => {
      try {
        const platform = Capacitor.getPlatform();
        if (platform === 'ios') {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: 'app-settings:' });
        } else {
          const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
          await NativeSettings.open({ optionIOS: IOSSettings.App, optionAndroid: AndroidSettings.AppNotification });
        }
      } catch {
        toast.error('Please go to Settings → Sociva → Notifications manually.');
      }
    };

    return (
      <div className="mx-4 mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm relative">
        <button
          onClick={() => { sessionStorage.setItem(DISMISSED_KEY, '1'); setDismissed(true); }}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-4">
          <div className="rounded-full bg-destructive/10 p-2.5 shrink-0">
            <Bell className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Notifications Blocked</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Open Settings to enable notifications for Sociva.
            </p>
          </div>
        </div>
        <Button onClick={openSettings} variant="outline" size="sm" className="w-full mt-3 gap-2">
          <ExternalLink className="h-3.5 w-3.5" />
          Open Settings
        </Button>
      </div>
    );
  }

  const handleTurnOn = async () => {
    setLoading(true);
    // CRITICAL: Call requestFullPermission directly in the click handler
    // — no try/catch wrapping the permission call itself, to preserve
    // the user-gesture context that iOS requires for the OS prompt.
    await requestFullPermission();
    setLoading(false);

    // After the permission flow completes, check if it was actually granted
    if (Capacitor.isNativePlatform()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const result = await PushNotifications.checkPermissions();
        if (result.receive !== 'granted') {
          setFailedSilently(true);
        }
      } catch {
        setFailedSilently(true);
      }
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="mx-4 mt-4 rounded-2xl border bg-card p-4 shadow-sm relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-4">
        <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Turn On Notifications</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Stay updated on your orders and community activity.
          </p>
        </div>
      </div>

      <Button
        onClick={handleTurnOn}
        disabled={loading}
        size="sm"
        className="w-full mt-3"
      >
        {loading ? 'Enabling…' : 'Turn On'}
      </Button>
    </div>
  );
}
