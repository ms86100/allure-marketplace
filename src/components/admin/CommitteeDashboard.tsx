import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Clock, Users, IndianRupee, Shield, TrendingUp } from 'lucide-react';

interface DashboardMetrics {
  openDisputes: number;
  resolvedDisputes: number;
  openSnags: number;
  resolvedSnags: number;
  pendingVisitors: number;
  maintenanceCollected: number;
  maintenancePending: number;
  totalResidents: number;
  pendingApprovals: number;
}

interface Props {
  societyId: string;
}

export function CommitteeDashboard({ societyId }: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, [societyId]);

  const fetchMetrics = async () => {
    setLoading(true);
    const [disputes, snags, visitors, maintenanceDues, residents, pending] = await Promise.all([
      supabase.from('dispute_tickets').select('status').eq('society_id', societyId),
      supabase.from('snag_tickets').select('status').eq('society_id', societyId),
      supabase.from('visitor_entries').select('status').eq('society_id', societyId).eq('status', 'expected'),
      supabase.from('maintenance_dues').select('status, amount').eq('society_id', societyId),
      supabase.from('profiles').select('id').eq('society_id', societyId).eq('verification_status', 'approved'),
      supabase.from('profiles').select('id').eq('society_id', societyId).eq('verification_status', 'pending'),
    ]);

    const disputeData = disputes.data || [];
    const snagData = snags.data || [];
    const duesData = (maintenanceDues.data as any[]) || [];

    setMetrics({
      openDisputes: disputeData.filter(d => !['resolved', 'closed'].includes(d.status)).length,
      resolvedDisputes: disputeData.filter(d => ['resolved', 'closed'].includes(d.status)).length,
      openSnags: snagData.filter(s => !['fixed', 'verified', 'closed'].includes(s.status)).length,
      resolvedSnags: snagData.filter(s => ['fixed', 'verified', 'closed'].includes(s.status)).length,
      pendingVisitors: (visitors.data || []).length,
      maintenanceCollected: duesData.filter(d => d.status === 'paid').reduce((s, d) => s + Number(d.amount), 0),
      maintenancePending: duesData.filter(d => d.status !== 'paid').reduce((s, d) => s + Number(d.amount), 0),
      totalResidents: (residents.data || []).length,
      pendingApprovals: (pending.data || []).length,
    });
    setLoading(false);
  };

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (!metrics) return null;

  const collectionRate = (metrics.maintenanceCollected + metrics.maintenancePending) > 0
    ? Math.round((metrics.maintenanceCollected / (metrics.maintenanceCollected + metrics.maintenancePending)) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <TrendingUp size={14} /> Operations Overview
      </h3>

      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle size={16} className="mx-auto text-destructive mb-1" />
            <p className="text-lg font-bold">{metrics.openDisputes}</p>
            <p className="text-[10px] text-muted-foreground">Open Disputes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle size={16} className="mx-auto text-warning mb-1" />
            <p className="text-lg font-bold">{metrics.openSnags}</p>
            <p className="text-[10px] text-muted-foreground">Open Snags</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Users size={16} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">{metrics.pendingApprovals}</p>
            <p className="text-[10px] text-muted-foreground">Pending Approvals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Shield size={16} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">{metrics.pendingVisitors}</p>
            <p className="text-[10px] text-muted-foreground">Expected Visitors</p>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Collection */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <IndianRupee size={16} className="text-primary" />
              <p className="font-semibold text-sm">Maintenance Collection</p>
            </div>
            <span className="text-xs font-medium text-primary">{collectionRate}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mb-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${collectionRate}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>₹{metrics.maintenanceCollected.toLocaleString()} collected</span>
            <span>₹{metrics.maintenancePending.toLocaleString()} pending</span>
          </div>
        </CardContent>
      </Card>

      {/* Resolution rates */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Dispute Resolution</p>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-success" />
              <span className="font-bold text-sm">
                {metrics.openDisputes + metrics.resolvedDisputes > 0
                  ? Math.round((metrics.resolvedDisputes / (metrics.openDisputes + metrics.resolvedDisputes)) * 100)
                  : 0}%
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Snag Resolution</p>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-success" />
              <span className="font-bold text-sm">
                {metrics.openSnags + metrics.resolvedSnags > 0
                  ? Math.round((metrics.resolvedSnags / (metrics.openSnags + metrics.resolvedSnags)) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
