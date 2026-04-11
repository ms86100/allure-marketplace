// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { DisplayStatusResult } from '@/lib/deriveDisplayStatus';
import { cn } from '@/lib/utils';
import { MapPin, Truck, Home, WifiOff } from 'lucide-react';

interface LiveActivityCardProps {
  displayStatus: DisplayStatusResult;
  sellerName: string;
  riderName?: string | null;
  riderPhone?: string | null;
  /** Whether GPS data is available and fresh */
  hasGps: boolean;
  /** Whether location data is stale */
  isLocationStale?: boolean;
  /** Last update time */
  lastUpdateAt?: string | null;
  /** Distance in meters */
  distanceMeters?: number | null;
}

function ProgressNode({
  icon: Icon,
  label,
  isActive,
  isComplete,
  isPulsing,
}: {
  icon: any;
  label: string;
  isActive: boolean;
  isComplete: boolean;
  isPulsing?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[60px]">
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500',
          isComplete
            ? 'bg-primary text-primary-foreground'
            : isActive
              ? 'bg-primary/20 text-primary ring-2 ring-primary/30'
              : 'bg-muted text-muted-foreground',
          isPulsing && 'animate-pulse'
        )}
      >
        <Icon size={14} />
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

function ProgressLine({ progress }: { progress: number }) {
  return (
    <div className="flex-1 h-[3px] bg-muted rounded-full overflow-hidden mx-1">
      <div
        className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </div>
  );
}

export function LiveActivityCard({
  displayStatus,
  sellerName,
  riderName,
  hasGps,
  isLocationStale,
  lastUpdateAt,
  distanceMeters,
}: LiveActivityCardProps) {
  const [prevEta, setPrevEta] = useState(displayStatus.etaText);
  const [isEtaAnimating, setIsEtaAnimating] = useState(false);

  // Animate ETA changes
  useEffect(() => {
    if (displayStatus.etaText !== prevEta) {
      setIsEtaAnimating(true);
      const t = setTimeout(() => {
        setPrevEta(displayStatus.etaText);
        setIsEtaAnimating(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [displayStatus.etaText, prevEta]);

  const { phase, progressPercent } = displayStatus;

  // Progress line calculations for the 3-segment display
  const isBeforePickup = phase === 'placed' || phase === 'preparing' || phase === 'ready';
  const isTransit = phase === 'transit';
  const isDone = phase === 'delivered';

  // Segment 1: Restaurant → Rider (0-50% of progress)
  const seg1Progress = isBeforePickup
    ? Math.min(100, (progressPercent / 35) * 100)
    : 100;

  // Segment 2: Rider → Home (40-100% of progress)
  const seg2Progress = isTransit
    ? Math.min(100, ((progressPercent - 40) / 55) * 100)
    : isDone ? 100 : 0;

  // Stale data warning
  const staleMinutes = lastUpdateAt
    ? Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 60000)
    : null;
  const showStaleWarning = isLocationStale || (staleMinutes != null && staleMinutes > 3);

  // Distance text
  const distanceText = distanceMeters
    ? distanceMeters < 1000
      ? `${distanceMeters}m away`
      : `${(distanceMeters / 1000).toFixed(1)} km away`
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 tracking-activity-card">
      {/* Status text with fade animation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">{displayStatus.emoji}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate animate-fade-in">
              {displayStatus.text}
            </p>
            {isTransit && distanceText && (
              <p className="text-[11px] text-muted-foreground">{distanceText}</p>
            )}
          </div>
        </div>

        {displayStatus.etaText && (
          <span
            className={cn(
              'text-xs font-bold text-primary whitespace-nowrap transition-all duration-300',
              isEtaAnimating && 'opacity-0 translate-y-1'
            )}
          >
            {isEtaAnimating ? prevEta : displayStatus.etaText}
          </span>
        )}
      </div>

      {/* 3-node progress line */}
      <div className="flex items-center px-2">
        <ProgressNode
          icon={MapPin}
          label={sellerName?.split(' ')[0] || 'Seller'}
          isComplete={phase !== 'placed'}
          isActive={phase === 'placed' || phase === 'preparing'}
          isPulsing={phase === 'preparing'}
        />
        <ProgressLine progress={seg1Progress} />
        <ProgressNode
          icon={Truck}
          label={riderName || 'Rider'}
          isComplete={isTransit && progressPercent > 60 || isDone}
          isActive={isTransit}
          isPulsing={isTransit && hasGps}
        />
        <ProgressLine progress={seg2Progress} />
        <ProgressNode
          icon={Home}
          label="You"
          isComplete={isDone}
          isActive={isTransit && progressPercent > 80}
        />
      </div>

      {/* Fallback states */}
      {isTransit && !hasGps && (
        <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <WifiOff size={14} />
          <p className="text-[11px]">Tracking temporarily unavailable</p>
        </div>
      )}

      {showStaleWarning && hasGps && (
        <p className="text-[10px] text-warning text-center">
          ⚠️ Last updated {staleMinutes} min ago
        </p>
      )}
    </div>
  );
}
