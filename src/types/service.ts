// Service booking domain types

export type ServiceType = 'scheduled' | 'on_demand' | 'group' | 'recurring';
export type ServiceLocationType = 'home_visit' | 'at_seller' | 'online';
export type ServicePriceModel = 'fixed' | 'hourly' | 'tiered';

export interface ServiceListing {
  id: string;
  product_id: string;
  service_type: ServiceType;
  location_type: ServiceLocationType;
  duration_minutes: number;
  buffer_minutes: number;
  max_bookings_per_slot: number;
  price_model: ServicePriceModel;
  cancellation_notice_hours: number;
  rescheduling_notice_hours: number;
  cancellation_fee_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceAvailabilitySchedule {
  id: string;
  seller_id: string;
  product_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface ServiceSlot {
  id: string;
  product_id: string;
  seller_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  booked_count: number;
  is_blocked: boolean;
  created_at: string;
}

export interface ServiceBooking {
  id: string;
  order_id: string;
  slot_id: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  location_type: ServiceLocationType;
  buyer_address: string | null;
  status: string;
  rescheduled_from: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const SERVICE_BOOKING_STATUSES = [
  'requested',
  'confirmed',
  'rescheduled',
  'scheduled',
  'on_the_way',
  'arrived',
  'in_progress',
  'completed',
  'no_show',
  'cancelled',
] as const;

export const SERVICE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: 'Requested', color: 'bg-blue-100 text-blue-800' },
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-800' },
  rescheduled: { label: 'Rescheduled', color: 'bg-purple-100 text-purple-800' },
  scheduled: { label: 'Scheduled', color: 'bg-cyan-100 text-cyan-800' },
  on_the_way: { label: 'On The Way', color: 'bg-orange-100 text-orange-800' },
  arrived: { label: 'Arrived', color: 'bg-teal-100 text-teal-800' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  no_show: { label: 'No Show', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};
