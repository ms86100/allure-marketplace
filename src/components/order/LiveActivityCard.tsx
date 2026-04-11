// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DisplayStatusResult } from '@/lib/deriveDisplayStatus';
import { StatusPhaseIcon } from '@/components/order/StatusPhaseIcon';
import { cn } from '@/lib/utils';
import { Check, WifiOff } from 'lucide-react';
import { cardEntrance, statusTransition } from '@/lib/motion-variants';

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

  // Filter steps: remove post-terminal redundant steps
  const displaySteps = flow.length > 0 ? filterDisplaySteps(flow, currentStatus) : [];
  const currentIdx = displaySteps.findIndex(s => s.status_key === currentStatus);
  const isTerminal = displaySteps.some(s => s.status_key === currentStatus && s.is_terminal);

  // Split into completed, current, future for compact layout
  const completedSteps = displaySteps.filter((_, i) => i < currentIdx);
  const currentStep = currentIdx >= 0 ? displaySteps[currentIdx] : null;
  const futureSteps = displaySteps.filter((_, i) => i > currentIdx);

  return (
    <motion.div
      variants={cardEntrance}
      initial="hidden"
      animate="show"
      className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl p-4 space-y-3 shadow-sm"
    >
      {/* Status header with ETA */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <StatusPhaseIcon icon={displayStatus.icon} iconColor={displayStatus.iconColor} size="md" />
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

      {/* Compact Stepper */}
      {displaySteps.length > 0 && (
        <div className="space-y-2">
          {/* Completed steps — horizontal pills */}
          {completedSteps.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {completedSteps.map((step, i) => {
                const label = step.buyer_display_label || step.display_label || step.status_key?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={step.status_key} className="flex items-center gap-1">
                    <div className="flex items-center gap-1 bg-primary/10 rounded-full px-2 py-0.5">
                      <Check size={10} className="text-primary" />
                      <span className="text-[10px] font-medium text-primary">{label}</span>
                    </div>
                    {i < completedSteps.length - 1 && (
                      <div className="w-2 h-[1.5px] bg-primary/30 rounded-full" />
                    )}
                  </div>
                );
              })}
              {currentStep && <div className="w-3 h-[1.5px] bg-primary/30 rounded-full" />}
            </div>
          )}

          {/* Current step — prominent card */}
          {currentStep && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-start gap-2.5 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2.5"
            >
              <div className="w-5 h-5 rounded-full bg-primary/20 ring-2 ring-primary/40 flex items-center justify-center shrink-0 mt-0.5">
                <motion.div
                  className="w-2 h-2 rounded-full bg-primary"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground">
                  {currentStep.buyer_display_label || currentStep.display_label || currentStep.status_key?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                {currentStep.buyer_hint && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{currentStep.buyer_hint}</p>
                )}
                {displayStatus.etaText && (
                  <p className="text-[10px] font-semibold text-primary mt-0.5">{displayStatus.etaText}</p>
                )}
              </div>
            </motion.div>
          )}

          {/* Future steps — muted horizontal pills */}
          {futureSteps.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {currentStep && <div className="w-3 h-[1.5px] bg-muted rounded-full" />}
              {futureSteps.map((step, i) => {
                const label = step.buyer_display_label || step.display_label || step.status_key?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={step.status_key} className="flex items-center gap-1">
                    <div className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-0.5">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                      <span className="text-[10px] text-muted-foreground/60">{label}</span>
                    </div>
                    {i < futureSteps.length - 1 && (
                      <div className="w-2 h-[1.5px] bg-muted rounded-full" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
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

/** Filter out redundant post-terminal steps (e.g. "completed", "payment_pending" after "delivered") */
function filterDisplaySteps(flow: FlowStep[], currentStatus?: string): FlowStep[] {
  if (!currentStatus) return flow;
  const currentIdx = flow.findIndex(s => s.status_key === currentStatus);
  const currentStep = flow[currentIdx];

  // If current step is terminal, show only up to it
  if (currentStep?.is_terminal) {
    return flow.slice(0, currentIdx + 1);
  }

  // Find the first terminal success step and cut off anything after it
  const firstTerminalIdx = flow.findIndex(s => s.is_terminal);
  if (firstTerminalIdx >= 0) {
    return flow.slice(0, firstTerminalIdx + 1);
  }

  return flow;
}
