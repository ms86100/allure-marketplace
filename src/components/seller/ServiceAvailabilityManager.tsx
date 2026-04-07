// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, RefreshCw, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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
  is_active: i >= 1 && i <= 6,
}));

interface ServiceAvailabilityManagerProps {
  sellerId: string;
  onComplete?: () => void;
}

export function ServiceAvailabilityManager({ sellerId, onComplete }: ServiceAvailabilityManagerProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [slotSummary, setSlotSummary] = useState<SlotSummary | null>(null);
  const isMounted = useRef(true);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    loadSchedule();
    loadSlotSummary();
  }, [sellerId]);

  // Auto-dismiss success after 5s
  useEffect(() => {
    if (saveState === 'saved') {
      dismissTimer.current = setTimeout(() => {
        if (isMounted.current) setSaveState('idle');
      }, 5000);
    }
    return () => clearTimeout(dismissTimer.current);
  }, [saveState]);

  const loadSchedule = async () => {
    try {
      const { data } = await (supabase
        .from('service_availability_schedules') as any)
        .select('*')
        .eq('seller_id', sellerId)
        .is('product_id', null)
        .order('day_of_week');

      if (data && data.length > 0) {
        const merged = DEFAULT_SCHEDULE.map(def => {
          const dbRow = data.find((r: any) => r.day_of_week === def.day_of_week);
          return dbRow ? {
            day_of_week: dbRow.day_of_week,
            start_time: dbRow.start_time?.slice(0, 5) || def.start_time,
            end_time: dbRow.end_time?.slice(0, 5) || def.end_time,
            is_active: dbRow.is_active ?? def.is_active,
          } : def;
        });
        if (isMounted.current) setSchedule(merged);
      }
    } catch (err) {
      console.error('Failed to load availability schedule:', err);
    } finally {
      if (isMounted.current) setIsLoading(false);
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

      if (!isMounted.current) return;

      if (data && data.length > 0) {
        const byDateMap: Record<string, number> = {};
        data.forEach((s: any) => {
          byDateMap[s.slot_date] = (byDateMap[s.slot_date] || 0) + 1;
        });

        const byDate = Object.entries(byDateMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => {
            const d = new Date(date + 'T00:00:00');
            return { date, dayName: DAYS[d.getDay()], dayNum: d.getDate(), count };
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
    // Reset feedback when user edits
    if (saveState !== 'idle') {
      setSaveState('idle');
      setFeedbackMessage('');
    }
  };

  const handleSaveAndGenerate = async () => {
    // Idempotency guard
    if (saveState === 'saving') return;

    setSaveState('saving');
    setFeedbackMessage('');

    try {
      // 1. Save schedules — delete+insert
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

      // 2. Query products with approval_status to determine state
      const { data: products } = await supabase
        .from('products')
        .select('id, approval_status')
        .eq('seller_id', sellerId);

      const hasServices = products && products.length > 0;
      const approvedProducts = products?.filter(p => (p as any).approval_status === 'approved') || [];
      const pendingProducts = products?.filter(p => (p as any).approval_status === 'pending') || [];

      if (!hasServices) {
        // No services yet — schedule saved, guide user
        if (!isMounted.current) return;
        setSaveState('saved');
        setFeedbackMessage('Schedule saved — add your first service to start generating slots');
        requestAnimationFrame(() => onComplete?.());
        return;
      }

      if (approvedProducts.length === 0) {
        // Has services but none approved
        if (!isMounted.current) return;
        setSaveState('saved');
        const msg = pendingProducts.length > 0
          ? 'Schedule saved — slots will generate once your services are approved'
          : 'Schedule saved — submit your services for approval to generate slots';
        setFeedbackMessage(msg);
        requestAnimationFrame(() => onComplete?.());
        return;
      }

      // 3. Has approved services — generate slots
      const approvedProductIds = approvedProducts.map(p => p.id);
      const { data: listings } = await (supabase
        .from('service_listings') as any)
        .select('product_id, duration_minutes, buffer_minutes, max_bookings_per_slot')
        .in('product_id', approvedProductIds);

      if (!listings || listings.length === 0) {
        if (!isMounted.current) return;
        setSaveState('saved');
        setFeedbackMessage('Schedule saved — configure service settings on your products to generate slots');
        requestAnimationFrame(() => onComplete?.());
        return;
      }

      // 4. Generate recurring slot templates per active day
      const slotsToInsert: any[] = [];

      for (const daySchedule of schedule) {
        if (!daySchedule.is_active) continue;

        const [startH, startM] = daySchedule.start_time.split(':').map(Number);
        const [endH, endM] = daySchedule.end_time.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (endMinutes <= startMinutes) continue;

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
              day_of_week: daySchedule.day_of_week,
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

      let actualInserted = 0;

      if (slotsToInsert.length > 0) {
        // Delete existing unbooked slots not referenced by bookings
        const { data: referencedSlotIds } = await supabase
          .from('service_bookings')
          .select('slot_id');
        const safeSlotIds = new Set((referencedSlotIds || []).map((r: any) => r.slot_id));

        const { data: candidateSlots } = await (supabase
          .from('service_slots') as any)
          .select('id')
          .eq('seller_id', sellerId)
          .eq('booked_count', 0);

        const idsToDelete = (candidateSlots || [])
          .filter((s: any) => !safeSlotIds.has(s.id))
          .map((s: any) => s.id);

        if (idsToDelete.length > 0) {
          const batchSize = 200;
          for (let i = 0; i < idsToDelete.length; i += batchSize) {
            await (supabase.from('service_slots') as any)
              .delete()
              .in('id', idsToDelete.slice(i, i + batchSize));
          }
        }

        const batchSize = 500;
        for (let i = 0; i < slotsToInsert.length; i += batchSize) {
          const batch = slotsToInsert.slice(i, i + batchSize);
          const { data: upsertedData, error: slotErr } = await (supabase
            .from('service_slots') as any)
            .upsert(batch, { onConflict: 'seller_id,product_id,day_of_week,start_time', ignoreDuplicates: false })
            .select('id');
          if (slotErr) {
            console.warn('Slot upsert batch error:', slotErr.message);
          } else {
            actualInserted += upsertedData?.length || 0;
          }
        }
      }

      if (!isMounted.current) return;

      const countDisplay = actualInserted > 0 ? actualInserted : slotsToInsert.length;
      setSaveState('saved');
      setFeedbackMessage(
        countDisplay > 0
          ? `Schedule saved — ${countDisplay} slots generated for next 14 days`
          : 'Schedule saved — slots generated successfully'
      );
      await loadSlotSummary();
      requestAnimationFrame(() => onComplete?.());
    } catch (err: any) {
      console.error('Failed to save/generate:', err);
      if (!isMounted.current) return;
      setSaveState('error');
      setFeedbackMessage(err.message || 'Failed to save schedule');
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
    <div className="bg-card rounded-xl p-4 sm:p-5 shadow-sm border space-y-4">
      <div className="flex items-center gap-2">
        <Calendar size={18} className="text-primary" />
        <h3 className="font-semibold">Service Availability</h3>
      </div>

      {/* Per-day schedule — Grid layout */}
      <div className="space-y-1.5">
        {schedule.map((day, index) => (
          <div
            key={day.day_of_week}
            className={`grid grid-cols-[36px_40px_1fr] items-center gap-x-3 px-3 py-2.5 rounded-lg border transition-colors ${
              day.is_active ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
            }`}
          >
            <Switch
              checked={day.is_active}
              onCheckedChange={(v) => updateDay(index, 'is_active', v)}
            />
            <span className="text-sm font-medium">{DAYS[index]}</span>
            {day.is_active ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={day.start_time}
                  onChange={(e) => updateDay(index, 'start_time', e.target.value)}
                  className="h-9 text-sm min-w-[90px] max-w-[120px] flex-1"
                />
                <span className="text-xs text-muted-foreground shrink-0">to</span>
                <Input
                  type="time"
                  value={day.end_time}
                  onChange={(e) => updateDay(index, 'end_time', e.target.value)}
                  className="h-9 text-sm min-w-[90px] max-w-[120px] flex-1"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        ))}
      </div>

      {/* Save & Generate */}
      <div className="flex gap-2">
        <Button
          onClick={handleSaveAndGenerate}
          disabled={saveState === 'saving'}
          className="flex-1 gap-2"
        >
          {saveState === 'saving' ? <Loader2 size={16} className="animate-spin" /> : null}
          Save & Generate Slots
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSaveAndGenerate}
          disabled={saveState === 'saving'}
          title="Regenerate slots"
        >
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Inline Feedback Banner */}
      {saveState === 'saved' && feedbackMessage && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <p className="text-sm text-green-800 dark:text-green-300">{feedbackMessage}</p>
        </div>
      )}

      {saveState === 'error' && feedbackMessage && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 animate-in fade-in slide-in-from-top-1">
          <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-destructive">{feedbackMessage}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 text-xs text-destructive hover:text-destructive"
              onClick={handleSaveAndGenerate}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Slot Summary */}
      {slotSummary && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-600" />
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
