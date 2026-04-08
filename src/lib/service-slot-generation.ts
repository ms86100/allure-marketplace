// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';

interface SlotGenerationResult {
  generated: number;
  deleted: number;
  products: number;
  message: string;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Client-side slot generation using the authenticated Supabase client.
 * Reads store-level schedules, approved products + service_listings,
 * then generates date-based slots for the next 14 days.
 *
 * @param sellerId  The seller profile ID
 * @param productId Optional — limit generation to a single product
 * @param scheduleOverride Optional — use these schedules instead of reading from DB
 *                         (useful when the caller just saved them and wants to avoid a re-read)
 */
export async function generateServiceSlots(
  sellerId: string,
  productId?: string | null,
  scheduleOverride?: { day_of_week: number; start_time: string; end_time: string; is_active: boolean }[]
): Promise<SlotGenerationResult> {
  // 1. Read store-level schedules
  let activeSchedules: { day_of_week: number; start_time: string; end_time: string; is_active: boolean }[];

  if (scheduleOverride) {
    activeSchedules = scheduleOverride.filter(s => s.is_active);
  } else {
    const { data: schedules, error: schedErr } = await (supabase
      .from('service_availability_schedules') as any)
      .select('day_of_week, start_time, end_time, is_active')
      .eq('seller_id', sellerId)
      .is('product_id', null)
      .order('day_of_week');

    if (schedErr) {
      console.error('Failed to read schedules:', schedErr.message);
      return { generated: 0, deleted: 0, products: 0, message: 'Failed to read store hours: ' + schedErr.message };
    }

    if (!schedules || schedules.length === 0) {
      return { generated: 0, deleted: 0, products: 0, message: 'No store hours configured. Set your Store Hours first.' };
    }

    activeSchedules = schedules.filter((s: any) => s.is_active);
  }

  if (activeSchedules.length === 0) {
    return { generated: 0, deleted: 0, products: 0, message: 'All days are turned off in Store Hours.' };
  }

  // Build day_of_week → schedule map
  const scheduleByDay = new Map<number, typeof activeSchedules>();
  for (const s of activeSchedules) {
    if (!scheduleByDay.has(s.day_of_week)) scheduleByDay.set(s.day_of_week, []);
    scheduleByDay.get(s.day_of_week)!.push(s);
  }

  // 2. Fetch approved products
  const { data: sellerProducts } = await supabase
    .from('products')
    .select('id, approval_status')
    .eq('seller_id', sellerId);

  if (!sellerProducts || sellerProducts.length === 0) {
    return { generated: 0, deleted: 0, products: 0, message: 'No products found. Add a service product first.' };
  }

  const approvedProducts = sellerProducts.filter((p: any) => p.approval_status === 'approved');
  if (approvedProducts.length === 0) {
    const pending = sellerProducts.filter((p: any) => p.approval_status === 'pending');
    return {
      generated: 0, deleted: 0, products: 0,
      message: pending.length > 0
        ? 'Hours saved — slots will generate once your services are approved'
        : 'No approved products found. Submit services for approval first.',
    };
  }

  const approvedIds = approvedProducts.map((p: any) => p.id);

  if (productId && !approvedIds.includes(productId)) {
    return { generated: 0, deleted: 0, products: 0, message: 'Product is not approved yet. Slots generate after approval.' };
  }

  const targetProductIds = productId ? [productId] : approvedIds;

  // 3. Fetch service listings
  let listings: any[] | null;
  const { data: initialListings } = await (supabase
    .from('service_listings') as any)
    .select('product_id, duration_minutes, buffer_minutes, max_bookings_per_slot')
    .in('product_id', targetProductIds);

  listings = initialListings;

  // Auto-create default service_listings for approved products missing them
  const coveredProductIds = new Set((listings || []).map((l: any) => l.product_id));
  const missingProductIds = targetProductIds.filter(id => !coveredProductIds.has(id));

  if (missingProductIds.length > 0) {
    const defaultListings = missingProductIds.map(pid => ({
      product_id: pid,
      duration_minutes: 60,
      buffer_minutes: 0,
      max_bookings_per_slot: 1,
      service_type: 'appointment',
      location_type: 'in_store',
      cancellation_notice_hours: 24,
      rescheduling_notice_hours: 12,
    }));

    await (supabase.from('service_listings') as any)
      .upsert(defaultListings, { onConflict: 'product_id' });

    // Re-fetch all listings including newly created
    const { data: allListings } = await (supabase
      .from('service_listings') as any)
      .select('product_id, duration_minutes, buffer_minutes, max_bookings_per_slot')
      .in('product_id', targetProductIds);

    listings = allListings;
    console.log(`Auto-created default service settings for ${missingProductIds.length} product(s)`);
  }

  if (!listings || listings.length === 0) {
    return { generated: 0, deleted: 0, products: 0, message: 'Could not create service settings. Please try again.' };
  }

  // 4. Generate date-based slots for next 14 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const DAYS_AHEAD = 14;
  const slotsToUpsert: any[] = [];

  for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dow = date.getDay();
    const dateStr = formatDate(date);

    const daySchedules = scheduleByDay.get(dow);
    if (!daySchedules) continue;

    for (const sched of daySchedules) {
      const [startH, startM] = sched.start_time.split(':').map(Number);
      const [endH, endM] = sched.end_time.split(':').map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;
      if (endMin <= startMin) continue;

      for (const listing of listings) {
        const duration = listing.duration_minutes || 60;
        const buffer = listing.buffer_minutes || 0;
        const maxCap = listing.max_bookings_per_slot || 1;
        let cur = startMin;

        while (cur + duration <= endMin) {
          const st = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
          const slotEnd = cur + duration;
          const et = `${String(Math.floor(slotEnd / 60)).padStart(2, '0')}:${String(slotEnd % 60).padStart(2, '0')}`;

          slotsToUpsert.push({
            seller_id: sellerId,
            product_id: listing.product_id,
            slot_date: dateStr,
            start_time: st,
            end_time: et,
            max_capacity: maxCap,
            booked_count: 0,
            is_blocked: false,
          });

          cur += duration + buffer;
        }
      }
    }
  }

  // 5. Safe delete: only future unbooked slots not tied to active bookings
  const todayStr = formatDate(today);
  const targetIds = listings.map((l: any) => l.product_id);

  const { data: activeBookingSlots } = await supabase
    .from('service_bookings')
    .select('slot_id');

  const safeSlotIds = new Set(
    (activeBookingSlots || []).map((r: any) => r.slot_id).filter(Boolean)
  );

  const { data: candidateSlots } = await (supabase
    .from('service_slots') as any)
    .select('id')
    .eq('seller_id', sellerId)
    .in('product_id', targetIds)
    .eq('booked_count', 0)
    .gte('slot_date', todayStr);

  const idsToDelete = (candidateSlots || [])
    .filter((s: any) => !safeSlotIds.has(s.id))
    .map((s: any) => s.id);

  let deletedCount = 0;
  if (idsToDelete.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      await (supabase.from('service_slots') as any)
        .delete()
        .in('id', idsToDelete.slice(i, i + batchSize));
      deletedCount += Math.min(batchSize, idsToDelete.length - i);
    }
  }

  // 6. Upsert new slots
  let generatedCount = 0;
  if (slotsToUpsert.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < slotsToUpsert.length; i += batchSize) {
      const batch = slotsToUpsert.slice(i, i + batchSize);
      const { data: upserted, error: upsertErr } = await (supabase
        .from('service_slots') as any)
        .upsert(batch, {
          onConflict: 'seller_id,product_id,slot_date,start_time',
          ignoreDuplicates: false,
        })
        .select('id');

      if (upsertErr) {
        console.error('Slot upsert error:', upsertErr.message);
      } else {
        generatedCount += upserted?.length || 0;
      }
    }
  }

  return {
    generated: generatedCount,
    deleted: deletedCount,
    products: listings.length,
    message: generatedCount > 0
      ? `${generatedCount} slots generated for ${listings.length} product(s)`
      : 'No slots could be generated. Check store hours and service config.',
  };
}
