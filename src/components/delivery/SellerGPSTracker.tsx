import { useBackgroundLocationTracking } from '@/hooks/useBackgroundLocationTracking';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SellerGPSTrackerProps {
  assignmentId: string;
}

export function SellerGPSTracker({ assignmentId }: SellerGPSTrackerProps) {
  const { isTracking, permissionDenied, lastSentAt, startTracking, stopTracking } = useBackgroundLocationTracking(assignmentId);

  const lastSentText = lastSentAt
    ? `Updated ${Math.round((Date.now() - lastSentAt) / 1000)}s ago`
    : null;

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

      {permissionDenied && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5">
          <p className="text-xs text-destructive">Location permission denied. Enable it in device settings to share your location with the buyer.</p>
        </div>
      )}

      {!isTracking ? (
        <Button
          onClick={startTracking}
          disabled={permissionDenied}
          className="w-full bg-primary text-primary-foreground h-10 gap-2"
        >
          <MapPin size={14} />
          Start Sharing Location
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <Loader2 size={14} className="animate-spin" />
              Sharing your location with buyer
            </div>
            {lastSentText && (
              <p className="text-[10px] text-muted-foreground mt-1">{lastSentText}</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={stopTracking}
            className="w-full h-9 text-xs"
          >
            Stop Sharing
          </Button>
        </div>
      )}
    </div>
  );
}
