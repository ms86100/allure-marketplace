import { Card, CardContent } from '@/components/ui/card';
import { Package, Clock, Calendar, CheckCircle } from 'lucide-react';

interface DashboardStatsProps {
  totalOrders: number;
  pendingOrders: number;
  todayOrders: number;
  completedOrders: number;
}

export function DashboardStats({ totalOrders, pendingOrders, todayOrders, completedOrders }: DashboardStatsProps) {
  const stats = [
    {
      icon: Package,
      value: totalOrders,
      label: 'Total Orders',
      color: 'text-primary',
    },
    {
      icon: Clock,
      value: pendingOrders,
      label: 'Pending',
      color: 'text-warning',
    },
    {
      icon: Calendar,
      value: todayOrders,
      label: 'Today',
      color: 'text-info',
    },
    {
      icon: CheckCircle,
      value: completedOrders,
      label: 'Completed',
      color: 'text-success',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map(({ icon: Icon, value, label, color }) => (
        <Card key={label}>
          <CardContent className="p-2.5 text-center">
            <Icon className={`mx-auto mb-1 ${color}`} size={18} />
            <p className="text-lg font-bold tabular-nums">{value}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
