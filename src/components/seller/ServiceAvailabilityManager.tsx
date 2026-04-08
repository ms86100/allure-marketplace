// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { generateServiceSlots } from '@/lib/service-slot-generation';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface DaySchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
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
  const isMounted = useRef(true);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { loadSchedule(); }, [sellerId]);

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
      console.error('Failed to load store hours:', err);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  const updateDay = (index: number, field: keyof DaySchedule, value: any) => {
    setSchedule(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
    if (saveState !== 'idle') {
      setSaveState('idle');
      setFeedbackMessage('');
    }
  };

  const handleSaveHours = async () => {
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

      // 2. Generate slots client-side using the shared utility
      //    Pass the schedule directly so we don't need to re-read from DB
      const result = await generateServiceSlots(sellerId, null, schedule);

      if (!isMounted.current) return;

      const gen = result.generated || 0;
      const products = result.products || 0;
      setSaveState('saved');
      setFeedbackMessage(
        gen > 0
          ? `Hours saved — ${gen} slots generated for ${products} product${products !== 1 ? 's' : ''}`
          : result.message || 'Hours saved. Add approved service products to generate slots.'
      );

      requestAnimationFrame(() => onComplete?.());
    } catch (err: any) {
      console.error('Failed to save store hours:', err);
      if (!isMounted.current) return;
      setSaveState('error');
      setFeedbackMessage(err.message || 'Failed to save hours');
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
        <h3 className="font-semibold">Store Hours</h3>
      </div>
      <p className="text-xs text-muted-foreground">Set your weekly operating hours. Booking slots for all your service products will be auto-generated based on these hours.</p>

      {/* Per-day schedule */}
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

      {/* Save */}
      <Button
        onClick={handleSaveHours}
        disabled={saveState === 'saving'}
        className="w-full gap-2"
      >
        {saveState === 'saving' ? <Loader2 size={16} className="animate-spin" /> : null}
        Save Hours
      </Button>

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
              onClick={handleSaveHours}
            >
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
