// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DisplayStatusResult } from '@/lib/deriveDisplayStatus';
import { cn } from '@/lib/utils';
import { MapPin, Truck, Home, WifiOff } from 'lucide-react';
import { cardEntrance, statusTransition, progressSpring } from '@/lib/motion-variants';

interface LiveActivityCardProps {
  displayStatus: DisplayStatusResult;
  sellerName: string;
  riderName?: string | null;
  riderPhone?: string | null;
  hasGps: boolean;
  isLocationStale?: boolean;
  lastUpdateAt?: string | null;
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
      <motion.div
        layout
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center',
          isComplete
            ? 'bg-primary text-primary-foreground'
            : isActive
              ? 'bg-primary/20 text-primary ring-2 ring-primary/30'
              : 'bg-muted text-muted-foreground',
        )}
        animate={isPulsing ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={isPulsing ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}
      >
        <Icon size={14} />
      </motion.div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

function ProgressLine({ progress }: { progress: number }) {
  return (
    <div className="flex-1 h-[3px] bg-muted rounded-full overflow-hidden mx-1">
      <motion.div
        className="h-full bg-primary rounded-full"
        animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        transition={progressSpring}
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

  const isBeforePickup = phase === 'placed' || phase === 'preparing' || phase === 'ready';
  const isTransit = phase === 'transit';
  const isDone = phase === 'delivered';

  const seg1Progress = isBeforePickup
    ? Math.min(100, (progressPercent / 35) * 100)
    : 100;

  const seg2Progress = isTransit
    ? Math.min(100, ((progressPercent - 40) / 55) * 100)
    : isDone ? 100 : 0;

  const staleMinutes = lastUpdateAt
    ? Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 60000)
    : null;
  const showStaleWarning = isLocationStale || (staleMinutes != null && staleMinutes > 3);

  const distanceText = distanceMeters
    ? distanceMeters < 1000
      ? `${distanceMeters}m away`
      : `${(distanceMeters / 1000).toFixed(1)} km away`
    : null;

  return (
    <motion.div
      variants={cardEntrance}
      initial="hidden"
      animate="show"
      className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 space-y-3 shadow-sm"
    >
      {/* Status text with AnimatePresence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">{displayStatus.emoji}</span>
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.p
                key={displayStatus.text}
                variants={statusTransition}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="text-sm font-bold text-foreground truncate"
              >
                {displayStatus.text}
              </motion.p>
            </AnimatePresence>
            {isTransit && distanceText && (
              <p className="text-[11px] text-muted-foreground">{distanceText}</p>
            )}
          </div>
        </div>

        {displayStatus.etaText && (
          <motion.span
            animate={{ opacity: isEtaAnimating ? 0 : 1, y: isEtaAnimating ? 4 : 0 }}
            transition={{ duration: 0.25 }}
            className="text-xs font-bold text-primary whitespace-nowrap"
          >
            {isEtaAnimating ? prevEta : displayStatus.etaText}
          </motion.span>
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
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex items-center gap-2 text-muted-foreground bg-muted/50 rounded-lg px-3 py-2"
        >
          <WifiOff size={14} />
          <p className="text-[11px]">Tracking temporarily unavailable</p>
        </motion.div>
      )}

      {showStaleWarning && hasGps && (
        <p className="text-[10px] text-warning text-center">
          ⚠️ Last updated {staleMinutes} min ago
        </p>
      )}
    </motion.div>
  );
}
