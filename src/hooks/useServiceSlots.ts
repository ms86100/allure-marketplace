// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, startOfToday } from 'date-fns';

export interface ServiceSlot {
  id: string;
  product_id: string;
  seller_id: string;
  slot_date: string;
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booked_count: number;
  is_blocked: boolean;
}

export function useServiceSlots(productId: string | undefined, daysAhead = 14) {
  const today = startOfToday();
  const endDate = addDays(today, daysAhead);

  return useQuery({
    queryKey: ['service-slots', productId, daysAhead],
    queryFn: async (): Promise<ServiceSlot[]> => {
      if (!productId) return [];

      const { data, error } = await supabase
        .from('service_slots')
        .select('*')
        .eq('product_id', productId)
        .eq('is_blocked', false)
        .gte('slot_date', format(today, 'yyyy-MM-dd'))
        .lte('slot_date', format(endDate, 'yyyy-MM-dd'))
        .order('slot_date')
        .order('start_time');

      if (error) throw error;

      const availableSlots = (data || []).filter(
        (slot: any) => slot.booked_count < slot.max_capacity
      ) as ServiceSlot[];

      if (availableSlots.length === 0) return [];

      const productIds = [...new Set(availableSlots.map(s => s.product_id))];
      const { data: approvedProducts } = await supabase
        .from('products')
        .select('id')
        .in('id', productIds)
        .eq('approval_status', 'approved');

      const approvedIds = new Set((approvedProducts || []).map((p: any) => p.id));
      return availableSlots.filter(s => approvedIds.has(s.product_id));
    },
    enabled: !!productId,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
  });
}

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

export function findSlot(slots: ServiceSlot[], date: string, time: string): ServiceSlot | undefined {
  return slots.find(s => s.slot_date === date && s.start_time === time);
}
