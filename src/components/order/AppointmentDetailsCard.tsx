import { format } from 'date-fns';
import { Calendar, Clock, MapPin, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SERVICE_STATUS_LABELS } from '@/types/service';
import type { ServiceBooking } from '@/types/service';

interface AppointmentDetailsCardProps {
  booking: ServiceBooking;
}

const LOCATION_LABELS: Record<string, string> = {
  home_visit: 'At Home',
  at_seller: 'At Seller',
  online: 'Online',
};

export function AppointmentDetailsCard({ booking }: AppointmentDetailsCardProps) {
  const bookingDate = new Date(booking.booking_date + 'T00:00:00');
  const statusConfig = SERVICE_STATUS_LABELS[booking.status];

  const handleAddToCalendar = () => {
    const start = new Date(`${booking.booking_date}T${booking.start_time}`);
    const end = new Date(`${booking.booking_date}T${booking.end_time}`);
    const formatICS = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `DTSTART:${formatICS(start)}`,
      `DTEND:${formatICS(end)}`,
      `SUMMARY:Appointment`,
      `LOCATION:${LOCATION_LABELS[booking.location_type] || booking.location_type}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'appointment.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Appointment Details</p>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-muted-foreground" />
          <div>
            <p className="text-[11px] text-muted-foreground">Date</p>
            <p className="text-sm font-semibold">{format(bookingDate, 'MMM d, yyyy')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted-foreground" />
          <div>
            <p className="text-[11px] text-muted-foreground">Time</p>
            <p className="text-sm font-semibold">{booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
        <MapPin size={12} />
        <span>{LOCATION_LABELS[booking.location_type] || booking.location_type}</span>
      </div>

      {statusConfig && (
        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-2 ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      )}

      <div className="mt-3">
        <Button variant="outline" size="sm" className="text-xs h-8" onClick={handleAddToCalendar}>
          <CalendarPlus size={13} className="mr-1.5" />
          Add to Calendar
        </Button>
      </div>
    </div>
  );
}
