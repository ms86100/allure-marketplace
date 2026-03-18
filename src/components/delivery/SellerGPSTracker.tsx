import { useBackgroundLocationTracking } from '@/hooks/useBackgroundLocationTracking';
import { Navigation, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

interface SellerGPSTrackerProps {
  assignmentId: string;
  autoStart?: boolean;
  deliveryStatus?: string;
}

const TERMINAL_STATUSES = ['delivered', 'completed', 'cancelled', 'failed'];

export function SellerGPSTracker({ assignmentId, autoStart = true, deliveryStatus }: SellerGPSTrackerProps) {
  const { isTracking, permissionDenied, lastSentAt, startTracking, stopTracking } = useBackgroundLocationTracking(assignmentId);
  const [now, setNow] = useState(Date.now());
  const wakeLockRef = useRef<any>(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (autoStart && !isTracking && !permissionDenied && !TERMINAL_STATUSES.includes(deliveryStatus || '')) {
      startTracking();
    }
  }, [autoStart, deliveryStatus, isTracking, permissionDenied, startTracking]);

  useEffect(() => {
    if (TERMINAL_STATUSES.includes(deliveryStatus || '') && isTracking) {
      stopTracking();
    }
  }, [deliveryStatus, isTracking, stopTracking]);

  useEffect(() => {
    if (!isTracking) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isTracking]);

  useEffect(() => {
    if (isNative || !isTracking || !('wakeLock' in navigator)) return;

    const requestWakeLock = async () => {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // ignore
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isTracking) {
        requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLockRef.current?.release?.().catch?.(() => {});
      wakeLockRef.current = null;
    };
  }, [isNative, isTracking]);

  const lastSentText = lastSentAt ? `Updated ${Math.round((now - lastSentAt) / 1000)}s ago` : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation size={16} className="text-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">GPS Broadcasting</p>
        </div>
        {isTracking && (
          <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Live
          </Badge>
        )}
      </div>

      {!isNative && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-2.5">
          <p className="text-xs text-foreground">Keep this screen open while delivering. Browser backgrounding can pause GPS updates.</p>
        </div>
      )}

      {permissionDenied && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5">
          <p className="text-xs text-destructive">Location permission denied. Enable it in device settings to share your location with the buyer.</p>
        </div>
      )}

      {!isTracking ? (
        <Button onClick={startTracking} disabled={permissionDenied || TERMINAL_STATUSES.includes(deliveryStatus || '')} className="w-full bg-primary text-primary-foreground h-10 gap-2">
          <Navigation size={14} />
          Start Sharing Location
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <Loader2 size={14} className="animate-spin" />
              Sharing your location with buyer
            </div>
            {lastSentText && <p className="text-[10px] text-muted-foreground mt-1">{lastSentText}</p>}
          </div>
          <Button variant="outline" onClick={stopTracking} className="w-full h-9 text-xs">
            Stop Sharing
          </Button>
        </div>
      )}
    </div>
  );
}
