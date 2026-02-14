import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import {
  IndianRupee, Calendar, CheckCircle, Clock, AlertTriangle, Building2
} from 'lucide-react';

interface PaymentMilestone {
  id: string;
  title: string;
  description: string | null;
  milestone_stage: string;
  amount_percentage: number;
  due_date: string | null;
  status: string;
  created_at: string;
}

interface ResidentPayment {
  id: string;
  milestone_id: string;
  amount: number;
  payment_status: string;
  paid_at: string | null;
  transaction_reference: string | null;
}

const stageOrder = ['booking', 'foundation', 'slab', 'structure', 'finishing', 'possession'];

const stageLabels: Record<string, string> = {
  booking: 'Booking',
  foundation: 'Foundation',
  slab: 'Slab Casting',
  structure: 'Structure',
  finishing: 'Finishing',
  possession: 'Possession',
};

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  upcoming: { color: 'bg-muted text-muted-foreground', icon: Clock },
  due: { color: 'bg-warning/10 text-warning', icon: AlertTriangle },
  overdue: { color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
  paid: { color: 'bg-success/10 text-success', icon: CheckCircle },
};

export default function PaymentMilestonesPage() {
  const { user, effectiveSocietyId, effectiveSociety } = useAuth();
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([]);
  const [payments, setPayments] = useState<ResidentPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!effectiveSocietyId) return;
    fetchData();
  }, [effectiveSocietyId]);

  const fetchData = async () => {
    setIsLoading(true);
    const [{ data: ms }, { data: ps }] = await Promise.all([
      supabase
        .from('payment_milestones')
        .select('*')
        .eq('society_id', effectiveSocietyId!)
        .order('due_date', { ascending: true }),
      user ? supabase
        .from('resident_payments')
        .select('*')
        .eq('resident_id', user.id)
        .eq('society_id', effectiveSocietyId!) : Promise.resolve({ data: [] }),
    ]);
    setMilestones((ms as PaymentMilestone[]) || []);
    setPayments((ps as ResidentPayment[]) || []);
    setIsLoading(false);
  };

  // Group milestones by stage
  const groupedMilestones = stageOrder.reduce((acc, stage) => {
    const stageMilestones = milestones.filter(m => m.milestone_stage === stage);
    if (stageMilestones.length > 0) {
      acc.push({ stage, milestones: stageMilestones });
    }
    return acc;
  }, [] as { stage: string; milestones: PaymentMilestone[] }[]);

  const totalPercentage = milestones.reduce((sum, m) => sum + m.amount_percentage, 0);
  const paidPercentage = milestones
    .filter(m => {
      const payment = payments.find(p => p.milestone_id === m.id);
      return payment?.payment_status === 'paid' || m.status === 'paid';
    })
    .reduce((sum, m) => sum + m.amount_percentage, 0);

  const getPaymentForMilestone = (milestoneId: string) =>
    payments.find(p => p.milestone_id === milestoneId);

  if (isLoading) {
    return (
      <AppLayout headerTitle="Payment Schedule" showLocation={false}>
        <div className="p-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout headerTitle="Payment Schedule" showLocation={false}>
      <div className="p-4 space-y-4">
        {/* Overview Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <IndianRupee className="text-primary" size={24} />
              </div>
              <div>
                <p className="font-semibold">{effectiveSociety?.name}</p>
                <p className="text-xs text-muted-foreground">Payment Milestone Tracker</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-semibold text-primary">{paidPercentage}% of {totalPercentage}%</span>
              </div>
              <Progress value={totalPercentage > 0 ? (paidPercentage / totalPercentage) * 100 : 0} className="h-3" />
            </div>
          </CardContent>
        </Card>

        {milestones.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="mx-auto mb-3" size={40} />
            <p className="font-semibold">No Payment Milestones</p>
            <p className="text-sm mt-1">Your society admin hasn't set up payment milestones yet.</p>
          </div>
        ) : (
          /* Timeline */
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

            {groupedMilestones.map(({ stage, milestones: stageMilestones }) => (
              <div key={stage} className="relative mb-6">
                {/* Stage header */}
                <div className="flex items-center gap-3 mb-3 relative z-10">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                    {stageOrder.indexOf(stage) + 1}
                  </div>
                  <h3 className="font-semibold">{stageLabels[stage] || stage}</h3>
                </div>

                {/* Milestone cards */}
                <div className="ml-14 space-y-3">
                  {stageMilestones.map(milestone => {
                    const payment = getPaymentForMilestone(milestone.id);
                    const effectiveStatus = payment?.payment_status === 'paid' ? 'paid' : milestone.status;
                    const config = statusConfig[effectiveStatus] || statusConfig.upcoming;
                    const StatusIcon = config.icon;

                    return (
                      <Card key={milestone.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm">{milestone.title}</p>
                                <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                                  <StatusIcon size={10} className="mr-0.5" />
                                  {effectiveStatus}
                                </Badge>
                              </div>
                              {milestone.description && (
                                <p className="text-xs text-muted-foreground mt-1">{milestone.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <IndianRupee size={10} /> {milestone.amount_percentage}% of total
                                </span>
                                {milestone.due_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar size={10} /> {new Date(milestone.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {payment?.paid_at && (
                            <p className="text-[10px] text-success mt-2">
                              ✓ Paid on {new Date(payment.paid_at).toLocaleDateString('en-IN')}
                              {payment.transaction_reference && ` • Ref: ${payment.transaction_reference}`}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
