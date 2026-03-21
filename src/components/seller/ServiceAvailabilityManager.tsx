import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DaySchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface SlotSummary {
  total: number;
  byDate: { date: string; dayName: string; dayNum: number; count: number }[];
  dateRange: string;
}

const DEFAULT_SCHEDULE: DaySchedule[] = DAYS.map((_, i) => ({
  day_of_week: i,
  start_time: '09:00',
  end_time: '18:00',
  is_active: i >= 1 && i <= 6, // Mon-Sat active by default
}));

interface ServiceAvailabilityManagerProps {
  sellerId: string;
}

export function ServiceAvailabilityManager({ sellerId }: ServiceAvailabilityManagerProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [slotSummary, setSlotSummary] = useState<SlotSummary | null>(null);

  // Load existing schedules from DB
  useEffect(() => {
    loadSchedule();
    loadSlotSummary();
  }, [sellerId]);

  const loadSchedule = async () => {
    try {
      const { data } = await (supabase
        .from('service_availability_schedules') as any)
        .select('*')
        .eq('seller_id', sellerId)
        .is('product_id', null)
        .order('day_of_week');

      if (data && data.length > 0) {
        // Merge DB data with defaults for any missing days
        const merged = DEFAULT_SCHEDULE.map(def => {
          const dbRow = data.find((r: any) => r.day_of_week === def.day_of_week);
          return dbRow ? {
            day_of_week: dbRow.day_of_week,
            start_time: dbRow.start_time?.slice(0, 5) || def.start_time,
            end_time: dbRow.end_time?.slice(0, 5) || def.end_time,
            is_active: dbRow.is_active ?? def.is_active,
          } : def;
        });
        setSchedule(merged);
      }
    } catch (err) {
      console.error('Failed to load availability schedule:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSlotSummary = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const endDate = format(addDays(new Date(), 14), 'yyyy-MM-dd');

      const { data } = await (supabase
        .from('service_slots') as any)
        .select('slot_date')
        .eq('seller_id', sellerId)
        .gte('slot_date', today)
        .lte('slot_date', endDate);

      if (data && data.length > 0) {
        const byDateMap: Record<string, number> = {};
        data.forEach((s: any) => {
          byDateMap[s.slot_date] = (byDateMap[s.slot_date] || 0) + 1;
        });

        const byDate = Object.entries(byDateMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => {
            const d = new Date(date + 'T00:00:00');
            return {
              date,
              dayName: DAYS[d.getDay()],
              dayNum: d.getDate(),
              count,
            };
          });

        const firstDate = byDate[0]?.date;
        const lastDate = byDate[byDate.length - 1]?.date;

        setSlotSummary({
          total: data.length,
          byDate,
          dateRange: firstDate && lastDate
            ? `${format(new Date(firstDate + 'T00:00:00'), 'dd MMM')} – ${format(new Date(lastDate + 'T00:00:00'), 'dd MMM')}`
            : '',
        });
      } else {
        setSlotSummary(null);
      }
    } catch (err) {
      console.error('Failed to load slot summary:', err);
    }
  };

  const updateDay = (index: number, field: keyof DaySchedule, value: any) => {
    setSchedule(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleSaveAndGenerate = async () => {
    setIsSaving(true);
    try {
      // 1. Save schedules — delete+insert pattern (partial unique indexes don't work with upsert)
      await (supabase
        .from('service_availability_schedules') as any)
        .delete()
        .eq('seller_id', sellerId)
        .is('product_id', null);

      const scheduleRows = schedule.map(s => ({
        seller_id: sellerId,
        product_id: null,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_active: s.is_active,
      }));

      const { error: schedErr } = await (supabase
        .from('service_availability_schedules') as any)
        .insert(scheduleRows);

      if (schedErr) throw schedErr;

      // 2. Get service products for this seller to determine duration
      const { data: products } = await supabase
        .from('products')
        .select('id, category')
        .eq('seller_id', sellerId)
        .eq('is_available', true)
        .eq('approval_status', 'approved');

      if (!products || products.length === 0) {
        toast.success('Schedule saved. Slots will be generated once your services are approved.');
        setIsSaving(false);
        return;
      }

      // Get service listings for duration info
      const productIds = products.map(p => p.id);
      const { data: listings } = await (supabase
        .from('service_listings') as any)
        .select('product_id, duration_minutes, buffer_minutes, max_bookings_per_slot')
        .in('product_id', productIds);

      if (!listings || listings.length === 0) {
        toast.success('Schedule saved. Configure service settings on your products to generate slots.');
        setIsSaving(false);
        return;
      }

      // 3. Generate slots for next 14 days
      const today = new Date();
      const slotsToInsert: any[] = [];

      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        const date = addDays(today, dayOffset);
        const dayOfWeek = date.getDay();
        const daySchedule = schedule.find(s => s.day_of_week === dayOfWeek);

        if (!daySchedule || !daySchedule.is_active) continue;

        const slotDate = format(date, 'yyyy-MM-dd');
        const [startH, startM] = daySchedule.start_time.split(':').map(Number);
        const [endH, endM] = daySchedule.end_time.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (endMinutes <= startMinutes) {
          toast.error(`${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]}: end time must be after start time`);
          continue;
        }

        for (const listing of listings) {
          const duration = listing.duration_minutes || 60;
          const buffer = listing.buffer_minutes || 0;
          const maxCap = listing.max_bookings_per_slot || 1;
          let currentMin = startMinutes;

          while (currentMin + duration <= endMinutes) {
            const slotStart = `${String(Math.floor(currentMin / 60)).padStart(2, '0')}:${String(currentMin % 60).padStart(2, '0')}`;
            const slotEndMin = currentMin + duration;
            const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, '0')}:${String(slotEndMin % 60).padStart(2, '0')}`;

            slotsToInsert.push({
              seller_id: sellerId,
              product_id: listing.product_id,
              slot_date: slotDate,
              start_time: slotStart,
              end_time: slotEnd,
              max_capacity: maxCap,
              booked_count: 0,
              is_blocked: false,
            });

            currentMin += duration + buffer;
          }
        }
      }

      if (slotsToInsert.length > 0) {
        // Delete future unbooked slots that have no active booking references
        const todayStr = format(today, 'yyyy-MM-dd');
        const { data: referencedSlotIds } = await supabase
          .from('service_bookings')
          .select('slot_id')
          .not('status', 'in', '(cancelled,no_show)');
        const safeSlotIds = new Set((referencedSlotIds || []).map((r: any) => r.slot_id));

        // First get candidate slots, then filter out referenced ones
        const { data: candidateSlots } = await (supabase
          .from('service_slots') as any)
          .select('id')
          .eq('seller_id', sellerId)
          .gte('slot_date', todayStr)
          .eq('booked_count', 0);

        const idsToDelete = (candidateSlots || [])
          .filter((s: any) => !safeSlotIds.has(s.id))
          .map((s: any) => s.id);

        if (idsToDelete.length > 0) {
          // Delete in batches to avoid query size limits
          const batchSize = 200;
          for (let i = 0; i < idsToDelete.length; i += batchSize) {
            await (supabase.from('service_slots') as any)
              .delete()
              .in('id', idsToDelete.slice(i, i + batchSize));
          }
        }

        // Insert new slots in batches
        const batchSize = 500;
        for (let i = 0; i < slotsToInsert.length; i += batchSize) {
          const batch = slotsToInsert.slice(i, i + batchSize);
          const { error: slotErr } = await (supabase
            .from('service_slots') as any)
            .insert(batch);
          if (slotErr) console.warn('Slot insert batch error:', slotErr.message);
        }
      }

      toast.success(`Schedule saved! ${slotsToInsert.length} slots generated.`);
      await loadSlotSummary();
    } catch (err: any) {
      console.error('Failed to save/generate:', err);
      toast.error(err.message || 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl p-4 shadow-sm border animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-4" />
        <div className="space-y-2">
          {[...Array(7)].map((_, i) => <div key={i} className="h-10 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border space-y-4">
      <div className="flex items-center gap-2">
        <Calendar size={18} className="text-primary" />
        <h3 className="font-semibold">Service Availability</h3>
      </div>

      {/* Per-day schedule */}
      <div className="space-y-2">
        {schedule.map((day, index) => (
          <div
            key={day.day_of_week}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              day.is_active ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
            }`}
          >
            <Switch
              checked={day.is_active}
              onCheckedChange={(v) => updateDay(index, 'is_active', v)}
            />
            <span className="text-sm font-medium w-10">{DAYS[index]}</span>
            {day.is_active ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time"
                  value={day.start_time}
                  onChange={(e) => updateDay(index, 'start_time', e.target.value)}
                  className="h-9 text-sm w-[120px]"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={day.end_time}
                  onChange={(e) => updateDay(index, 'end_time', e.target.value)}
                  className="h-9 text-sm w-[120px]"
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Save & Generate */}
      <div className="flex gap-2">
        <Button
          onClick={handleSaveAndGenerate}
          disabled={isSaving}
          className="flex-1 gap-2"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
          Save & Generate Slots
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSaveAndGenerate}
          disabled={isSaving}
          title="Regenerate slots"
        >
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Slot Summary */}
      {slotSummary && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-success" />
              <span className="text-sm font-medium">{slotSummary.total} slots generated</span>
            </div>
            <span className="text-xs text-muted-foreground">{slotSummary.dateRange}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {slotSummary.byDate.map((d) => (
              <div
                key={d.date}
                className="flex flex-col items-center px-2 py-1.5 rounded-md bg-card border text-center min-w-[48px]"
              >
                <span className="text-[10px] font-medium text-muted-foreground">{d.dayName}</span>
                <span className="text-sm font-bold text-primary">{d.dayNum}</span>
                <span className="text-[10px] text-muted-foreground">{d.count} slots</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
