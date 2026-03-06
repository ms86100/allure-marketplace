import { Link } from 'react-router-dom';
import { TrendingUp, ChevronRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

interface EarningsSummaryProps {
  todayEarnings: number;
  weekEarnings: number;
  totalEarnings: number;
}

export function EarningsSummary({ todayEarnings, weekEarnings, totalEarnings }: EarningsSummaryProps) {
  const { formatPrice } = useCurrency();
  return (
    <Link to="/seller/earnings">
      <div className="bg-gradient-to-r from-success/10 to-success/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-success" size={20} />
            <h3 className="font-semibold">Earnings Summary</h3>
          </div>
          <ChevronRight className="text-muted-foreground" size={18} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-background/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="text-lg font-bold text-success tabular-nums">{formatPrice(todayEarnings)}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="text-lg font-bold text-success tabular-nums">{formatPrice(weekEarnings)}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">All Time</p>
            <p className="text-lg font-bold text-success tabular-nums">{formatPrice(totalEarnings)}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
