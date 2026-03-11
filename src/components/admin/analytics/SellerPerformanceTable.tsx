import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSellerPerformance, PeriodFilter } from '@/hooks/queries/useAdminAnalytics';
import { PeriodSelector } from './PeriodSelector';
import { useState } from 'react';
import { Star } from 'lucide-react';

export function SellerPerformanceTable() {
  const [period, setPeriod] = useState<PeriodFilter>('7d');
  const { data: sellers, isLoading } = useSellerPerformance(period);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold">Seller Performance</h3>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <Card className="border-0 shadow-[var(--shadow-card)] rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-bold">Seller</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Orders</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Today</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Revenue</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sellers || []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="py-2.5">
                      <p className="text-xs font-bold truncate max-w-[140px]">{s.business_name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.societyName}</p>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-right tabular-nums">{s.orderCount}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {s.todayOrders > 0 ? <Badge variant="secondary" className="text-[10px] h-5">{s.todayOrders}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-right tabular-nums">₹{s.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-0.5 text-xs">
                        <Star size={10} className="fill-amber-400 text-amber-400" />
                        {s.rating?.toFixed(1) || '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {!sellers?.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">No sellers found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
