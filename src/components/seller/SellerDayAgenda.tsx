import { useMemo } from 'react';
import { format, startOfToday } from 'date-fns';
import { useSellerServiceBookings, type ServiceBooking } from '@/hooks/useServiceBookings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Clock, User, CalendarCheck, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SellerDayAgendaProps {
  sellerId: string;
}

const STATUS_COLORS: Record<string, string> = {
  requested: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-cyan-100 text-cyan-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  rescheduled: 'bg-purple-100 text-purple-700',
};

export function SellerDayAgenda({ sellerId }: SellerDayAgendaProps) {
  const { data: bookings = [], isLoading } = useSellerServiceBookings(sellerId);
  const navigate = useNavigate();
  const today = useMemo(() => startOfToday(), []);

  const todayBookings = useMemo(() => {
    const dateStr = format(today, 'yyyy-MM-dd');
    return bookings
      .filter((b) => b.booking_date === dateStr && !['cancelled', 'no_show'].includes(b.status))
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [bookings, today]);

  if (isLoading) {
    return <Card><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>;
  }

  if (todayBookings.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarCheck size={16} className="text-primary" />
          Today's Schedule
          <Badge variant="secondary" className="text-[10px] ml-auto">{todayBookings.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 px-4 pb-4">
        <div className="relative">
          {todayBookings.map((booking, i) => {
            const isLast = i === todayBookings.length - 1;
            const isActive = booking.status === 'in_progress';
            return (
              <div key={booking.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 z-10',
                    isActive ? 'bg-primary ring-2 ring-primary/30' :
                    booking.status === 'completed' ? 'bg-muted-foreground' : 'bg-primary/50'
                  )} />
                  {!isLast && <div className="w-px flex-1 bg-border min-h-[40px]" />}
                </div>

                <div className={cn('pb-4 flex-1 min-w-0', isLast && 'pb-0')}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold tabular-nums text-foreground">
                      {booking.start_time?.slice(0, 5)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      – {booking.end_time?.slice(0, 5)}
                    </span>
                    <Badge variant="secondary" className={cn('text-[9px] h-4 ml-auto', STATUS_COLORS[booking.status] || '')}>
                      {booking.status}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium truncate mt-0.5">{booking.product_name || 'Service'}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User size={10} /> {booking.buyer_name || 'Customer'}
                  </p>
                  <div className="flex gap-1.5 mt-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => navigate(`/orders/${booking.order_id}`)}
                    >
                      <MessageCircle size={10} /> View
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
