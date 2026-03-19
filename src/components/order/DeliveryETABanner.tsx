import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { computeETA } from '@/lib/etaEngine';

interface DeliveryETABannerProps {
  estimatedDeliveryAt: string;
}

export function DeliveryETABanner({ estimatedDeliveryAt }: DeliveryETABannerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const eta = computeETA(estimatedDeliveryAt, now);

  return (
    <div className={`${eta.isLate ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800/30' : 'bg-accent/10 border-accent/20'} border rounded-xl px-4 py-3 flex items-center gap-3`}>
      <div className={`w-9 h-9 rounded-full ${eta.isLate ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-accent/20'} flex items-center justify-center shrink-0`}>
        <Clock size={18} className={eta.isLate ? 'text-orange-600 dark:text-orange-400' : 'text-accent'} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{eta.displayText}</p>
        <p className="text-[11px] text-muted-foreground">{eta.subtitle}</p>
      </div>
    </div>
  );
}
