import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminAnalytics } from '@/hooks/queries/useAdminAnalytics';
import { PeriodSelector } from './PeriodSelector';
import { ShoppingCart, TrendingUp, Store, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

function MetricCard({ icon: Icon, value, label, color }: { icon: any; value: string; label: string; color: string }) {
  return (
    <Card className="border-0 shadow-[var(--shadow-card)] rounded-2xl">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
          <Icon size={17} className="text-white" />
        </div>
        <div>
          <p className="text-xl font-extrabold tabular-nums">{value}</p>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlatformOverview() {
  const { period, setPeriod, overview } = useAdminAnalytics();
  const d = overview.data;
  const fmt = (n: number) => n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Platform Overview</h3>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      {overview.isLoading ? (
        <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <MetricCard icon={ShoppingCart} value={String(d?.totalOrders || 0)} label="Total Orders" color="bg-amber-500" />
          <MetricCard icon={TrendingUp} value={fmt(d?.totalRevenue || 0)} label="Revenue" color="bg-emerald-500" />
          <MetricCard icon={Store} value={String(d?.activeSellers || 0)} label="Active Sellers" color="bg-blue-500" />
          <MetricCard icon={Package} value={String(d?.productsSold || 0)} label="Items Sold" color="bg-violet-500" />
        </div>
      )}
    </div>
  );
}
