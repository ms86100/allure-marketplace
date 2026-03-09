import { Button } from '@/components/ui/button';
import { CalendarPlus } from 'lucide-react';

interface CalendarExportButtonProps {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  description?: string;
}

function pad(t: string) {
  return t.length === 5 ? t + ':00' : t;
}

function toICSDate(date: string, time: string): string {
  const d = date.replace(/-/g, '');
  const t = pad(time).replace(/:/g, '').slice(0, 6);
  return `${d}T${t}`;
}

function generateICS({ title, date, startTime, endTime, location, description }: CalendarExportButtonProps): string {
  const dtStart = toICSDate(date, startTime);
  const dtEnd = toICSDate(date, endTime);
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lovable//ServiceBooking//EN',
    'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return lines;
}

export function CalendarExportButton(props: CalendarExportButtonProps) {
  const handleExport = () => {
    const icsContent = generateICS(props);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `appointment-${props.date}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={handleExport}>
      <CalendarPlus size={12} />
      Add to Calendar
    </Button>
  );
}
