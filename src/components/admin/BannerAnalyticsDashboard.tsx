// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Eye, MousePointer, Users, TrendingUp } from 'lucide-react';

export function BannerAnalyticsDashboard() {
  const { data: analytics = [], isLoading } = useQuery({
    queryKey: ['banner-analytics-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_banner_analytics_summary');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
    );
  }

  if (analytics.length === 0) {
    return (
      <Card className="border-0 shadow-[var(--shadow-card)] rounded-2xl">
        <CardContent className="py-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
            <BarChart3 size={20} className="text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">No analytics data yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">Banner performance data will appear here once banners get impressions.</p>
        </CardContent>
      </Card>
    );
  }

  // Summary totals
  const totals = analytics.reduce(
    (acc: any, row: any) => ({
      impressions: acc.impressions + (Number(row.impressions) || 0),
      clicks: acc.clicks + (Number(row.clicks) || 0) + (Number(row.section_clicks) || 0),
      viewers: acc.viewers + (Number(row.unique_viewers) || 0),
    }),
    { impressions: 0, clicks: 0, viewers: 0 }
  );

  const overallCtr = totals.impressions > 0
    ? ((totals.clicks / totals.impressions) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <BarChart3 size={15} className="text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold">Banner Analytics</h3>
          <p className="text-[10px] text-muted-foreground">{analytics.length} banner{analytics.length !== 1 ? 's' : ''} tracked</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard icon={Eye} label="Impressions" value={formatNumber(totals.impressions)} color="text-blue-600" bgColor="bg-blue-500/10" />
        <SummaryCard icon={MousePointer} label="Clicks" value={formatNumber(totals.clicks)} color="text-green-600" bgColor="bg-green-500/10" />
        <SummaryCard icon={Users} label="Unique Viewers" value={formatNumber(totals.viewers)} color="text-purple-600" bgColor="bg-purple-500/10" />
        <SummaryCard icon={TrendingUp} label="CTR" value={`${overallCtr}%`} color="text-amber-600" bgColor="bg-amber-500/10" />
      </div>

      {/* Per-Banner Breakdown */}
      <div className="space-y-2">
        {analytics.map((row: any) => (
          <Card key={row.banner_id} className="border-0 shadow-[var(--shadow-card)] rounded-2xl">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold truncate flex-1">{row.banner_title || 'Untitled'}</p>
                <Badge
                  className="text-[9px] h-4 px-1.5 border-0 shrink-0"
                  style={{
                    backgroundColor: Number(row.ctr) > 5 ? 'hsl(var(--success) / 0.1)' : Number(row.ctr) > 2 ? 'hsl(var(--warning) / 0.1)' : 'hsl(var(--muted))',
                    color: Number(row.ctr) > 5 ? 'hsl(var(--success))' : Number(row.ctr) > 2 ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {Number(row.ctr).toFixed(1)}% CTR
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-xs font-bold">{formatNumber(Number(row.impressions))}</p>
                  <p className="text-[9px] text-muted-foreground">Impressions</p>
                </div>
                <div>
                  <p className="text-xs font-bold">{formatNumber(Number(row.clicks))}</p>
                  <p className="text-[9px] text-muted-foreground">Clicks</p>
                </div>
                <div>
                  <p className="text-xs font-bold">{formatNumber(Number(row.section_clicks))}</p>
                  <p className="text-[9px] text-muted-foreground">Sections</p>
                </div>
                <div>
                  <p className="text-xs font-bold">{formatNumber(Number(row.unique_viewers))}</p>
                  <p className="text-[9px] text-muted-foreground">Viewers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color, bgColor }: { icon: any; label: string; value: string; color: string; bgColor: string }) {
  return (
    <Card className="border-0 shadow-[var(--shadow-card)] rounded-2xl">
      <CardContent className="p-3 text-center">
        <div className={`w-8 h-8 rounded-xl ${bgColor} flex items-center justify-center mx-auto mb-1.5`}>
          <Icon size={14} className={color} />
        </div>
        <p className="text-sm font-bold">{value}</p>
        <p className="text-[9px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
