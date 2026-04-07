// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, startOfToday, getDay } from 'date-fns';

export interface ServiceSlot {
  id: string;
  product_id: string;
  seller_id: string;
  slot_date: string;       // Virtual — derived from day_of_week
  day_of_week: number;     // 0 = Sunday, 6 = Saturday
  start_time: string;
  end_time: string;
  max_capacity: number;
  booked_count: number;
  is_blocked: boolean;
}

export function useServiceSlots(productId: string | undefined, daysAhead = 14) {
  const today = startOfToday();

  return useQuery({
    queryKey: ['service-slots', productId, daysAhead],
    queryFn: async (): Promise<ServiceSlot[]> => {
      if (!productId) return [];

      // 1. Fetch recurring slot templates (day_of_week based)
      const { data, error } = await supabase
        .from('service_slots')
        .select('*')
        .eq('product_id', productId)
        .eq('is_blocked', false);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // 2. Verify product is approved
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('approval_status', 'approved')
        .maybeSingle();

      if (!product) return [];

      // 3. Expand recurring templates into virtual dated slots for the next N days
      const expandedSlots: ServiceSlot[] = [];
      for (let d = 0; d < daysAhead; d++) {
        const date = addDays(today, d);
        const dow = getDay(date); // 0 = Sunday
        const dateStr = format(date, 'yyyy-MM-dd');

        const matchingSlots = data.filter((s: any) => s.day_of_week === dow);
        for (const slot of matchingSlots) {
          if (slot.booked_count < slot.max_capacity) {
            expandedSlots.push({
              id: slot.id,
              product_id: slot.product_id,
              seller_id: slot.seller_id,
              slot_date: dateStr,
              day_of_week: slot.day_of_week,
              start_time: slot.start_time,
              end_time: slot.end_time,
              max_capacity: slot.max_capacity,
              booked_count: slot.booked_count,
              is_blocked: slot.is_blocked,
            });
          }
        }
      }

      return expandedSlots;
    },
    enabled: !!productId,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
  });
}

/** Transform service slots into the format TimeSlotPicker expects */
export function slotsToPickerFormat(slots: ServiceSlot[]): { date: string; slots: string[] }[] {
  const grouped: Record<string, string[]> = {};
  for (const slot of slots) {
    if (!grouped[slot.slot_date]) grouped[slot.slot_date] = [];
    const timeStr = slot.start_time;
    if (!grouped[slot.slot_date].includes(timeStr)) {
      grouped[slot.slot_date].push(timeStr);
    }
  }
  return Object.entries(grouped).map(([date, times]) => ({
    date,
    slots: times.sort(),
  }));
}

/** Find the slot record matching a date + time */
export function findSlot(slots: ServiceSlot[], date: string, time: string): ServiceSlot | undefined {
  return slots.find(s => s.slot_date === date && s.start_time === time);
}
