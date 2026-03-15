import { Capacitor } from '@capacitor/core';

interface CalendarEventData {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  description?: string;
}

/**
 * On native (iOS/Android), opens the system calendar prompt.
 * On web, downloads an .ics file.
 */
export async function addToCalendar(data: CalendarEventData): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await addToNativeCalendar(data);
  } else {
    downloadICS(data);
  }
}

async function addToNativeCalendar(data: CalendarEventData): Promise<void> {
  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');

    // Request write permission first
    await CapacitorCalendar.requestWriteOnlyCalendarAccess();

    await CapacitorCalendar.createEventWithPrompt({
      title: data.title,
      startDate: data.startDate.getTime(),
      endDate: data.endDate.getTime(),
      location: data.location,
      description: data.description,
    });
  } catch (error) {
    console.warn('Native calendar failed, falling back to ICS:', error);
    downloadICS(data);
  }
}

function downloadICS(data: CalendarEventData): void {
  const formatICS = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lovable//ServiceBooking//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatICS(data.startDate)}`,
    `DTEND:${formatICS(data.endDate)}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${data.title}`,
    data.location ? `LOCATION:${data.location}` : '',
    data.description ? `DESCRIPTION:${data.description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appointment.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
