// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DisplayStatusResult } from '@/lib/deriveDisplayStatus';
import { cn } from '@/lib/utils';
import { Check, WifiOff } from 'lucide-react';
import { cardEntrance, statusTransition, progressSpring } from '@/lib/motion-variants';

interface FlowStep {
  status_key: string;
  display_label?: string;
  buyer_display_label?: string;
  buyer_hint?: string;
  icon?: string;
  is_terminal?: boolean;
  is_transit?: boolean;
  sort_order?: number;
}

interface LiveActivityCardProps {
  displayStatus: DisplayStatusResult;
  sellerName: string;
  riderName?: string | null;
  riderPhone?: string | null;
  hasGps: boolean;
  isLocationStale?: boolean;
  lastUpdateAt?: string | null;
  distanceMeters?: number | null;
  flow?: FlowStep[];
  currentStatus?: string;
}

export function LiveActivityCard({
  displayStatus,
  sellerName,
  riderName,
  hasGps,
  isLocationStale,
  lastUpdateAt,
  distanceMeters,
  flow = [],
  currentStatus,
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

  const { phase } = displayStatus;
  const isTransit = phase === 'transit';

  const staleMinutes = lastUpdateAt
    ? Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 60000)
    : null;
  const showStaleWarning = isLocationStale || (staleMinutes != null && staleMinutes > 3);

  const distanceText = distanceMeters
    ? distanceMeters < 1000
      ? `${distanceMeters}m away`
      : `${(distanceMeters / 1000).toFixed(1)} km away`
    : null;

  // Build vertical timeline steps from flow
  const displaySteps = flow.length > 0 ? flow : [];
  const currentIdx = displaySteps.findIndex(s => s.status_key === currentStatus);

  return (
    <motion.div
      variants={cardEntrance}
      initial="hidden"
      animate="show"
      className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 space-y-3 shadow-sm"
    >
      {/* Status header with ETA */}
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

      {/* Vertical Timeline (Swiggy/Zomato style) */}
      {displaySteps.length > 0 && (
        <div className="pl-1 space-y-0">
          {displaySteps.map((step, index) => {
            const isComplete = index < currentIdx;
            const isCurrent = index === currentIdx;
            const isFuture = index > currentIdx;
            const label = step.buyer_display_label || step.display_label || step.status_key?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const hint = step.buyer_hint;
            const isLast = index === displaySteps.length - 1;

            return (
              <div key={step.status_key} className="flex gap-3">
                {/* Timeline node + line */}
                <div className="flex flex-col items-center">
                  <motion.div
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10',
                      isComplete ? 'bg-primary text-primary-foreground' :
                      isCurrent ? 'bg-primary/20 ring-2 ring-primary/40' :
                      'bg-muted'
                    )}
                    animate={isCurrent ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                    transition={isCurrent ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
                  >
                    {isComplete ? (
                      <Check size={10} className="text-primary-foreground" />
                    ) : isCurrent ? (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    ) : null}
                  </motion.div>
                  {!isLast && (
                    <div className={cn(
                      'w-[2px] flex-1 min-h-[24px]',
                      isComplete ? 'bg-primary' : 'bg-muted'
                    )} />
                  )}
                </div>

                {/* Step content */}
                <div className={cn('pb-3 min-w-0', isLast && 'pb-0')}>
                  <p className={cn(
                    'text-xs leading-tight',
                    isCurrent ? 'font-bold text-foreground' :
                    isComplete ? 'font-medium text-muted-foreground' :
                    'font-normal text-muted-foreground/60'
                  )}>
                    {label}
                  </p>
                  {isCurrent && hint && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
                  )}
                  {isCurrent && displayStatus.etaText && (
                    <p className="text-[10px] font-semibold text-primary mt-0.5">
                      {displayStatus.etaText}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback: no GPS during transit */}
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
