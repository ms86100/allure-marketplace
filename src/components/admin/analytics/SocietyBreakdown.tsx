import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSocietyBreakdown, PeriodFilter } from '@/hooks/queries/useAdminAnalytics';
import { PeriodSelector } from './PeriodSelector';
import { useState } from 'react';

export function SocietyBreakdown() {
  const [period, setPeriod] = useState<PeriodFilter>('7d');
  const { data: societies, isLoading } = useSocietyBreakdown(period);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold">Society Breakdown</h3>
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
                  <TableHead className="text-[11px] font-bold">Society</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Sellers</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Orders</TableHead>
                  <TableHead className="text-[11px] font-bold text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(societies || []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="py-2.5">
                      <p className="text-xs font-bold truncate max-w-[140px]">{s.name}</p>
                      <Badge variant="secondary" className="text-[9px] h-4 mt-0.5">{s.member_count} members</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-right tabular-nums">{s.sellerCount}</TableCell>
                    <TableCell className="text-xs font-bold text-right tabular-nums">{s.orderCount}</TableCell>
                    <TableCell className="text-xs font-bold text-right tabular-nums">₹{s.revenue.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!societies?.length && (
                  <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">No data</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
