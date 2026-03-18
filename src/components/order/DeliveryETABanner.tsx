import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DeliveryETABannerProps {
  estimatedDeliveryAt: string;
}

export function DeliveryETABanner({ estimatedDeliveryAt }: DeliveryETABannerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const targetTime = new Date(estimatedDeliveryAt).getTime();
  const diffMs = targetTime - now;

  const isLate = diffMs < 0;
  const diffMin = isLate ? 0 : Math.ceil(diffMs / 60000);
  const displayText = isLate
    ? 'Running a bit late — arriving soon'
    : diffMin <= 1
      ? 'Arriving any moment'
      : diffMin <= 60
        ? `Estimated arrival in ${diffMin} min`
        : `Estimated arrival in ${Math.round(diffMin / 60)}h ${diffMin % 60}m`;

  return (
    <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
        <Clock size={18} className="text-accent" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{displayText}</p>
        <p className="text-[11px] text-muted-foreground">
          By {new Date(estimatedDeliveryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
