import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, Bell, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UrgentOrderTimerProps {
  autoCancelAt: string;
  onTimeout?: () => void;
  className?: string;
  showBell?: boolean;
  variant?: 'seller' | 'buyer';
}

export function UrgentOrderTimer({
  autoCancelAt,
  onTimeout,
  className,
  showBell = true,
  variant = 'seller',
}: UrgentOrderTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);

  const calculateTimeLeft = useCallback(() => {
    const now = new Date().getTime();
    const cancelTime = new Date(autoCancelAt).getTime();
    return Math.max(0, Math.floor((cancelTime - now) / 1000));
  }, [autoCancelAt]);

  useEffect(() => {
    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      if (remaining <= 0 && !isExpired) {
        setIsExpired(true);
        onTimeout?.();
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [autoCancelAt, calculateTimeLeft, isExpired, onTimeout]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const isUrgent = timeLeft <= 60;
  const isCritical = timeLeft <= 30;
  const isBuyer = variant === 'buyer';

  if (isExpired) {
    return (
      <div className={cn('flex items-center gap-2 text-destructive', className)}>
        <AlertTriangle size={18} />
        <span className="font-medium">
          {isBuyer ? 'Seller didn't respond — order auto-cancelled' : 'Time expired - Order auto-cancelled'}
        </span>
      </div>
    );
  }

  if (isBuyer) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-colors',
          isCritical
            ? 'bg-destructive/5 border-destructive/30'
            : isUrgent
            ? 'bg-warning/5 border-warning/30'
            : 'bg-muted/50 border-border',
          className
        )}
      >
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
          isCritical ? 'bg-destructive/10' : 'bg-primary/10'
        )}>
          <Loader2 size={18} className={cn('animate-spin', isCritical ? 'text-destructive' : 'text-primary')} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Waiting for seller to respond</p>
          <p className="text-xs text-muted-foreground">
            {isCritical ? 'Order will auto-cancel soon if seller doesn't respond' : 'Order will be auto-cancelled if seller doesn't respond'}
          </p>
        </div>

        <div className={cn(
          'flex items-center gap-1 font-mono text-lg font-bold shrink-0',
          isCritical ? 'text-destructive' : isUrgent ? 'text-warning' : 'text-muted-foreground'
        )}>
          <Clock size={16} />
          <span>{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}</span>
        </div>
      </div>
    );
  }

  // Seller variant (original)
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border-2 transition-colors',
        isCritical
          ? 'bg-destructive/10 border-destructive animate-pulse'
          : isUrgent
          ? 'bg-warning/10 border-warning'
          : 'bg-primary/10 border-primary',
        className
      )}
    >
      {showBell && (
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            isCritical
              ? 'bg-destructive text-destructive-foreground animate-bounce'
              : isUrgent
              ? 'bg-warning text-warning-foreground'
              : 'bg-primary text-primary-foreground'
          )}
        >
          <Bell size={20} className={isCritical ? 'animate-wiggle' : ''} />
        </div>
      )}

      <div className="flex-1">
        <p className="text-sm font-medium">
          {isCritical ? '⚠️ Urgent! Respond now' : 'Action required'}
        </p>
        <p className="text-xs text-muted-foreground">
          Order will auto-cancel if not acted upon
        </p>
      </div>

      <div
        className={cn(
          'flex items-center gap-1 font-mono text-lg font-bold',
          isCritical
            ? 'text-destructive'
            : isUrgent
            ? 'text-warning'
            : 'text-primary'
        )}
      >
        <Clock size={18} />
        <span>
          {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}