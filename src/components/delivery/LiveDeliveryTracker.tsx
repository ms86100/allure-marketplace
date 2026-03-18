import { useDeliveryTracking, type DeliveryTrackingState } from '@/hooks/useDeliveryTracking';
import { Phone, Truck, Navigation, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface LiveDeliveryTrackerProps {
  assignmentId: string;
  isBuyerView: boolean;
  /** Gap D: Accept pre-existing tracking state to avoid duplicate subscriptions */
  trackingState?: DeliveryTrackingState;
  /** Gap F: Road-based ETA from OSRM, more accurate than Haversine */
  roadEtaMinutes?: number | null;
}

function formatDistance(meters: number | null): string {
  if (!meters) return '';
  if (meters < 1000) return `${meters}m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

function computeDistanceEta(distanceMeters: number): number {
  return Math.max(1, Math.ceil(distanceMeters / 1000 * 4));
}

function getSmartEta(distance: number | null, dbEta: number | null): number | null {
  if (distance !== null && distance < 500) {
    return computeDistanceEta(distance);
  }
  if (distance !== null && dbEta !== null && dbEta > computeDistanceEta(distance)) {
    return computeDistanceEta(distance);
  }
  return dbEta;
}

function getProximityMessage(distance: number | null, eta: number | null, proximityStatus: string | null, isBuyerView: boolean): string {
  if (proximityStatus === 'at_doorstep') return isBuyerView ? '🏠 At your doorstep!' : '🏠 You are at the doorstep.';
  if (proximityStatus === 'arriving') return isBuyerView ? '🏃 Almost there!' : '🏃 You are almost there.';
  if (proximityStatus === 'nearby') return isBuyerView ? '📍 Arriving soon!' : '📍 Buyer is nearby on your route.';

  const smartEta = getSmartEta(distance, eta);
  if (distance !== null && distance < 50) return isBuyerView ? '🏠 At your doorstep!' : '🏠 You are at the doorstep.';
  if (distance !== null && distance < 200) return isBuyerView ? '🏃 Almost there!' : '🏃 You are almost there.';
  if (distance !== null && distance < 500) return isBuyerView ? '📍 Arriving soon!' : `📍 About ${formatDistance(distance)}`;
  if (smartEta !== null && smartEta <= 2) return isBuyerView ? '⏱️ Arriving in about 2 minutes' : '⏱️ Around 2 minutes away';
  if (smartEta !== null && smartEta <= 5) return isBuyerView ? `⏱️ Arriving in about ${smartEta} minutes` : `⏱️ Around ${smartEta} minutes away`;
  if (smartEta !== null) return `🕐 ETA: ${smartEta} minutes`;
  if (distance !== null) return `📏 ${formatDistance(distance)}`;
  return isBuyerView ? '🛵 On the way to you' : '🛵 Delivery in progress';
}

function getLastSeenText(lastLocationAt: string | null): string | null {
  if (!lastLocationAt) return null;
  const diffMs = Date.now() - new Date(lastLocationAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return null;
  if (diffMin > 3) return `Last seen ${diffMin} min ago`;
  return null;
}

export function LiveDeliveryTracker({ assignmentId, isBuyerView }: LiveDeliveryTrackerProps) {
  const tracking = useDeliveryTracking(assignmentId);

  if (tracking.isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (!tracking.status) return null;

  const isInTransit = ['picked_up', 'on_the_way', 'at_gate'].includes(tracking.status);
  const lastSeen = getLastSeenText(tracking.lastLocationAt);

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation size={16} className="text-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Tracking</p>
        </div>
        {(() => {
          const smartEta = getSmartEta(tracking.distance, tracking.eta);
          return smartEta && isInTransit ? (
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              <Clock size={10} className="mr-1" />
              {smartEta > 3 ? `${smartEta - 1}–${smartEta + 1} min` : `${smartEta} min`}
            </Badge>
          ) : null;
        })()}
      </div>

      {isInTransit && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
          <p className="text-sm font-semibold text-primary">
            {getProximityMessage(tracking.distance, tracking.eta, tracking.proximityStatus, isBuyerView)}
          </p>
          {tracking.distance !== null && tracking.distance > 500 && (
            <p className="text-xs text-muted-foreground mt-1">{formatDistance(tracking.distance)}</p>
          )}
          {tracking.isLocationStale && (
            <p className="text-[10px] text-destructive mt-1">⚠️ Location may be outdated — GPS is not updating</p>
          )}
          {!tracking.isLocationStale && lastSeen && (
            <p className="text-[10px] text-muted-foreground mt-1">⚠️ {lastSeen}</p>
          )}
        </div>
      )}

      {tracking.riderName && (
        <div className="flex items-center justify-between bg-muted/50 rounded-lg p-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {tracking.riderPhotoUrl ? (
                <img src={tracking.riderPhotoUrl} alt="Delivery partner" className="w-full h-full object-cover" />
              ) : (
                <Truck size={16} className="text-primary" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{tracking.riderName}</p>
              <p className="text-[11px] text-muted-foreground">Delivery Partner</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tracking.riderPhone && (
              <a href={`tel:${tracking.riderPhone}`} className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <Phone size={14} className="text-accent" />
              </a>
            )}
          </div>
        </div>
      )}

      {isBuyerView ? (
        <p className="text-xs text-muted-foreground">
          {tracking.status === 'assigned' && `✅ ${tracking.riderName || 'A rider'} will pick up your order soon.`}
          {tracking.status === 'picked_up' && '🚚 Your order has been picked up!'}
          {tracking.status === 'on_the_way' && '🛵 Your order is on the way!'}
          {tracking.status === 'at_gate' && '🏠 Delivery partner is at your society gate.'}
          {tracking.status === 'delivered' && '🎉 Your order has been delivered!'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {tracking.status === 'assigned' && `🚴 ${tracking.riderName || 'Rider'} assigned.`}
          {tracking.status === 'picked_up' && '📦 Pickup confirmed. Live delivery has started.'}
          {tracking.status === 'on_the_way' && '🛵 You are on the way to the buyer.'}
          {tracking.status === 'at_gate' && '🏠 You are at the buyer\'s gate.'}
          {tracking.status === 'delivered' && '✅ Delivery completed.'}
        </p>
      )}
    </div>
  );
}
