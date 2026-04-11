// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { cardEntrance, staggerContainer } from '@/lib/motion-variants';

interface SellerRefundListProps {
  sellerId: string;
}

const STATUS_STYLES: Record<string, { label: string; color: string; icon: any }> = {
  requested: { label: 'Action Needed', color: 'bg-warning/10 text-warning border-warning/20', icon: Clock },
  approved: { label: 'Approved', color: 'bg-primary/10 text-primary border-primary/20', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
  settled: { label: 'Settled', color: 'bg-success/10 text-success border-success/20', icon: CheckCircle2 },
  processing: { label: 'Processing', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Clock },
};

export function SellerRefundList({ sellerId }: SellerRefundListProps) {
  const { data: refunds = [], isLoading, error } = useQuery({
    queryKey: ['seller-refund-requests', sellerId],
    queryFn: async () => {
      // Single query: join refund_requests to orders filtered by seller_id
      const { data: refundData, error } = await supabase
        .from('refund_requests')
        .select('id, order_id, status, category, reason, amount, created_at, orders!inner(seller_id)')
        .eq('orders.seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return refundData || [];
    },
    enabled: !!sellerId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert size={15} className="text-warning" />
          <h3 className="font-semibold text-sm">Buyer Disputes & Refunds</h3>
        </div>
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 size={16} className="animate-spin mr-2" />
          <span className="text-xs">Loading disputes…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-destructive/30 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-destructive" />
          <h3 className="font-semibold text-sm">Buyer Disputes & Refunds</h3>
        </div>
        <p className="text-xs text-destructive mt-2">Failed to load disputes. Pull to refresh.</p>
      </div>
    );
  }

  if (refunds.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={15} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Buyer Disputes & Refunds</h3>
        </div>
        <p className="text-xs text-muted-foreground">No disputes or refund requests right now.</p>
      </div>
    );
  }

  const pendingCount = refunds.filter((r: any) => r.status === 'requested').length;
  const totalRefundAmount = refunds.filter((r: any) => ['approved', 'settled', 'processing', 'auto_approved'].includes(r.status)).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
  const settledAmount = refunds.filter((r: any) => r.status === 'settled').reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

  return (
    <motion.div variants={cardEntrance} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className={pendingCount > 0 ? 'text-warning' : 'text-muted-foreground'} />
          <h3 className="font-semibold text-sm">Buyer Disputes & Refunds</h3>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 px-1.5 rounded-full animate-pulse">
              {pendingCount} action needed
            </Badge>
          )}
        </div>
      </div>

      {/* Refund impact on earnings */}
      {totalRefundAmount > 0 && (
        <div className="flex items-center gap-3 bg-destructive/5 border border-destructive/15 rounded-lg p-2.5">
          <AlertTriangle size={14} className="text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-destructive">Earnings Impact</p>
            <p className="text-[10px] text-muted-foreground">
              ₹{totalRefundAmount.toLocaleString('en-IN')} in refunds
              {settledAmount > 0 && ` · ₹${settledAmount.toLocaleString('en-IN')} settled`}
            </p>
          </div>
        </div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
        <AnimatePresence>
          {refunds.map((refund: any) => {
            const config = STATUS_STYLES[refund.status] || STATUS_STYLES.requested;
            const Icon = config.icon;
            const isPending = refund.status === 'requested';

            return (
              <motion.div key={refund.id} variants={cardEntrance} layout>
                <Link to={`/orders/${refund.order_id}`}>
                  <div className={`rounded-xl border p-3 transition-colors hover:bg-accent/5 ${isPending ? 'border-warning/30 bg-warning/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${config.color}`}>
                          <Icon size={10} />
                          {config.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {refund.category?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        "{refund.reason}"
                      </p>
                      <p className="text-sm font-bold tabular-nums">₹{refund.amount}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(refund.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
