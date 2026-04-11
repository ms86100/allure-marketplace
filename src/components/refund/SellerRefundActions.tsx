// @ts-nocheck
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cardEntrance } from '@/lib/motion-variants';

interface SellerRefundActionsProps {
  refundId: string;
  refundStatus: string;
  refundAmount: number;
  refundReason: string;
  refundCategory: string;
  createdAt: string;
  onActionComplete?: () => void;
}

export function SellerRefundActions({
  refundId,
  refundStatus,
  refundAmount,
  refundReason,
  refundCategory,
  createdAt,
  onActionComplete,
}: SellerRefundActionsProps) {
  const [acting, setActing] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const isPending = refundStatus === 'requested';

  async function handleApprove() {
    setActing(true);
    try {
      const { error } = await supabase
        .from('refund_requests')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', refundId);
      if (error) throw error;
      toast.success('Refund approved');
      onActionComplete?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve refund');
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim() || rejectionReason.trim().length < 5) {
      toast.error('Please provide a reason for rejection (min 5 characters)');
      return;
    }
    setActing(true);
    try {
      const { error } = await supabase
        .from('refund_requests')
        .update({ status: 'rejected', rejection_reason: rejectionReason.trim() })
        .eq('id', refundId);
      if (error) throw error;
      toast.success('Refund rejected');
      setShowReject(false);
      onActionComplete?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject refund');
    } finally {
      setActing(false);
    }
  }

  const categoryLabels: Record<string, string> = {
    order_issue: 'Order Issue',
    quality_issue: 'Quality Problem',
    wrong_item: 'Wrong Item',
    not_received: 'Not Received',
    seller_cancelled: 'Seller Cancelled',
    other: 'Other',
  };

  return (
    <motion.div variants={cardEntrance} className="bg-warning/5 border border-warning/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-warning" />
          <p className="text-sm font-semibold">Refund Request</p>
        </div>
        {isPending && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-warning/10 text-warning flex items-center gap-1">
            <Clock size={10} /> Awaiting Response
          </span>
        )}
      </div>

      <div className="bg-background/60 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Amount</span>
          <span className="text-sm font-bold">₹{refundAmount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Category</span>
          <span className="text-xs font-medium">{categoryLabels[refundCategory] || refundCategory}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Requested</span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
          "{refundReason}"
        </p>
      </div>

      {isPending && (
        <>
          <div className="flex items-center gap-1.5 px-1">
            <AlertTriangle size={12} className="text-warning shrink-0" />
            <p className="text-[10px] text-muted-foreground">You have 48 hours to respond. Auto-approval applies after deadline.</p>
          </div>

          <AnimatePresence mode="wait">
            {!showReject ? (
              <motion.div
                key="actions"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex gap-2"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReject(true)}
                  disabled={acting}
                  className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <XCircle size={14} className="mr-1" /> Reject
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={acting}
                  className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                >
                  {acting ? <Loader2 size={14} className="animate-spin mr-1" /> : <CheckCircle2 size={14} className="mr-1" />}
                  Approve Refund
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="reject-form"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-2"
              >
                <Textarea
                  placeholder="Why are you rejecting this refund?"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  className="min-h-[60px] text-sm"
                />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowReject(false)} disabled={acting} className="flex-1">
                    Back
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleReject}
                    disabled={acting || rejectionReason.trim().length < 5}
                    className="flex-1"
                  >
                    {acting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                    Confirm Reject
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
