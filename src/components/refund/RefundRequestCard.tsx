// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cardEntrance } from '@/lib/motion-variants';

interface RefundRequestCardProps {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  isBuyerView: boolean;
  totalAmount: number;
  onRefundRequested?: () => void;
}

interface RefundRequest {
  id: string;
  status: string;
  amount: number;
  reason: string;
  category: string;
  auto_approved: boolean;
  created_at: string;
  approved_at: string | null;
  settled_at: string | null;
  rejection_reason: string | null;
}

const REFUND_CATEGORIES = [
  { value: 'order_issue', label: 'Order Issue' },
  { value: 'quality_issue', label: 'Quality Problem' },
  { value: 'wrong_item', label: 'Wrong Item Received' },
  { value: 'not_received', label: 'Not Received' },
  { value: 'seller_cancelled', label: 'Seller Cancelled' },
  { value: 'other', label: 'Other' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  requested: { label: 'Refund Requested', color: 'bg-warning/10 text-warning', icon: Clock },
  approved: { label: 'Approved', color: 'bg-primary/10 text-primary', icon: CheckCircle2 },
  auto_approved: { label: 'Auto-Approved', color: 'bg-primary/10 text-primary', icon: ShieldCheck },
  processing: { label: 'Processing', color: 'bg-blue-500/10 text-blue-500', icon: Loader2 },
  settled: { label: 'Settled', color: 'bg-green-500/10 text-green-500', icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'bg-green-600/10 text-green-600', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-destructive/10 text-destructive', icon: XCircle },
};

export function RefundRequestCard({ orderId, orderStatus, paymentStatus, isBuyerView, totalAmount, onRefundRequested }: RefundRequestCardProps) {
  const { user } = useAuth();
  const [existingRefund, setExistingRefund] = useState<RefundRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('order_issue');
  const [submitting, setSubmitting] = useState(false);

  const canRequestRefund = isBuyerView &&
    ['paid', 'buyer_confirmed', 'seller_verified', 'completed'].includes(paymentStatus) &&
    ['delivered', 'completed', 'cancelled', 'failed', 'buyer_received'].includes(orderStatus);

  useEffect(() => {
    fetchRefund();
  }, [orderId]);

  async function fetchRefund() {
    setLoading(true);
    const { data } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setExistingRefund(data[0] as RefundRequest);
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!reason.trim() || reason.trim().length < 10) {
      toast.error('Please provide a detailed reason (at least 10 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('request_refund', {
        p_order_id: orderId,
        p_reason: reason.trim(),
        p_category: category,
      });

      if (error) throw error;
      toast.success('Refund request submitted successfully');
      setShowForm(false);
      setReason('');
      await fetchRefund();
      onRefundRequested?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit refund request');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  // Show existing refund status
  if (existingRefund) {
    const statusKey = existingRefund.auto_approved && existingRefund.status === 'approved' ? 'auto_approved' : existingRefund.status;
    const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.requested;
    const Icon = config.icon;

    return (
      <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" />
            <p className="text-sm font-semibold">Refund Request</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${config.color}`}>
            <Icon size={10} className="inline mr-1" />
            {config.label}
          </span>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{existingRefund.reason}</p>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">₹{existingRefund.amount}</p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(existingRefund.created_at).toLocaleDateString()}
            </p>
          </div>
          {existingRefund.rejection_reason && (
            <div className="mt-2 p-2 bg-destructive/5 rounded-lg">
              <p className="text-[11px] text-destructive font-medium">Rejection: {existingRefund.rejection_reason}</p>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // Show request refund button/form for eligible buyers
  if (!canRequestRefund) return null;

  if (!showForm) {
    return (
      <motion.div variants={cardEntrance} className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="text-destructive" size={18} />
          <div>
            <p className="text-sm font-semibold">Issue with order?</p>
            <p className="text-[11px] text-muted-foreground">Request a refund</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="border-destructive/30 text-destructive hover:bg-destructive/10">
          Request Refund
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div variants={cardEntrance} className="bg-card/80 backdrop-blur-lg border border-border/50 rounded-xl px-4 py-3 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-primary" />
        <p className="text-sm font-semibold">Request Refund</p>
      </div>

      <div className="p-2.5 bg-muted/50 rounded-lg">
        <p className="text-xs text-muted-foreground">Refund amount</p>
        <p className="text-lg font-bold">₹{totalAmount}</p>
      </div>

      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Select reason category" />
        </SelectTrigger>
        <SelectContent>
          {REFUND_CATEGORIES.map(c => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Textarea
        placeholder="Describe the issue in detail (min 10 characters)..."
        value={reason}
        onChange={e => setReason(e.target.value)}
        className="min-h-[80px] text-sm"
      />

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={submitting || reason.trim().length < 10} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
          {submitting ? <><Loader2 size={14} className="animate-spin mr-1" /> Submitting...</> : 'Submit Request'}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        A dispute ticket will be auto-created. Seller has 48 hours to respond.
      </p>
    </motion.div>
  );
}
