import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UrgentOrderTimerProps {
  autoCancelAt: string;
  onTimeout?: () => void;
  className?: string;
  showBell?: boolean;
}

export function UrgentOrderTimer({
  autoCancelAt,
  onTimeout,
  className,
  showBell = true,
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

  const isUrgent = timeLeft <= 60; // Less than 1 minute
  const isCritical = timeLeft <= 30; // Less than 30 seconds

  if (isExpired) {
    return (
      <div className={cn('flex items-center gap-2 text-destructive', className)}>
        <AlertTriangle size={18} />
        <span className="font-medium">Time expired - Order auto-cancelled</span>
      </div>
    );
  }

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
