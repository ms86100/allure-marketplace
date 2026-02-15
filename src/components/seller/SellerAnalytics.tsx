import { useSellerAnalytics } from '@/hooks/queries/useSellerAnalytics';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Users, TrendingUp, XCircle, Clock } from 'lucide-react';

interface SellerAnalyticsProps {
  sellerId: string;
}

export function SellerAnalytics({ sellerId }: SellerAnalyticsProps) {
  const { data, isLoading } = useSellerAnalytics(sellerId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!data || data.totalOrders === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4 text-center">
          <BarChart3 className="mx-auto text-muted-foreground mb-2" size={24} />
          <p className="text-sm text-muted-foreground">Analytics will appear after your first orders</p>
        </CardContent>
      </Card>
    );
  }

  const formatHour = (h: number) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <BarChart3 size={16} className="text-primary" />
        Insights
      </h3>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <Users size={16} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">{data.repeatCustomers}</p>
            <p className="text-[10px] text-muted-foreground">Repeat Buyers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp size={16} className="mx-auto text-success mb-1" />
            <p className="text-lg font-bold">{data.totalCustomers}</p>
            <p className="text-[10px] text-muted-foreground">Total Buyers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <XCircle size={16} className="mx-auto text-destructive mb-1" />
            <p className="text-lg font-bold">{data.cancellationRate}%</p>
            <p className="text-[10px] text-muted-foreground">Cancellations</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      {data.topProducts.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Most Ordered Items</p>
            <div className="space-y-2">
              {data.topProducts.map((p, i) => (
                <div key={p.product_name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}.</span>
                    <span className="truncate">{p.product_name}</span>
                  </span>
                  <span className="text-xs font-semibold text-primary shrink-0">{p.total_ordered} sold</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Peak Hours */}
      {data.peakHours.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <Clock size={12} /> Peak Ordering Hours
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.peakHours.map((h) => (
                <span
                  key={h.hour}
                  className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium"
                >
                  {formatHour(h.hour)} ({h.order_count})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
