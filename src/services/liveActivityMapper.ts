import type { LiveActivityData } from '@/plugins/live-activity/definitions';

/** Human-readable progress descriptions shown as the subtitle on the lock screen widget */
const PROGRESS_DESCRIPTIONS: Record<string, string> = {
  accepted: 'Order Accepted',
  confirmed: 'Booking Confirmed',
  preparing: 'Order Being Prepared',
  ready: 'Order Ready',
  picked_up: 'Order Picked Up',
  en_route: 'Order On The Way',
  on_the_way: 'Order On The Way',
};

/** Maps order status to a 0.0–1.0 progress value for the animated bar */
const STATUS_PROGRESS: Record<string, number> = {
  accepted: 0.10,
  confirmed: 0.10,
  preparing: 0.40,
  ready: 0.75,
  picked_up: 0.55,
  on_the_way: 0.70,
  en_route: 0.80,
  delivered: 1.0,
  completed: 1.0,
};

/** Reasonable max distance (km) for progress interpolation heuristic */
const MAX_DELIVERY_DISTANCE_KM = 10;

/**
 * Maps order status + delivery info into a meaningful progress stage string.
 */
function mapProgressStage(
  status: string,
  delivery?: {
    eta_minutes?: number | null;
    rider_name?: string | null;
  } | null,
): string | null {
  if ((status === 'en_route' || status === 'on_the_way' || status === 'picked_up') && delivery) {
    const parts: string[] = [];
    if (delivery.rider_name) parts.push(delivery.rider_name);
    if (delivery.eta_minutes != null) parts.push(`ETA ${delivery.eta_minutes} min`);
    if (parts.length > 0) return parts.join(' · ');
  }

  return PROGRESS_DESCRIPTIONS[status] ?? null;
}

/**
 * Builds a LiveActivityData payload from an order row and optional
 * delivery assignment data.
 */
export function buildLiveActivityData(
  order: {
    id: string;
    status: string;
  },
  delivery?: {
    eta_minutes?: number | null;
    distance_meters?: number | null;
    rider_name?: string | null;
    vehicle_type?: string | null;
  } | null,
  sellerName?: string | null,
): LiveActivityData {
  return {
    entity_type: 'order',
    entity_id: order.id,
    workflow_status: order.status,
    eta_minutes: delivery?.eta_minutes ?? null,
    driver_distance: delivery?.distance_meters != null
      ? delivery.distance_meters / 1000
      : null,
    driver_name: delivery?.rider_name ?? null,
    vehicle_type: delivery?.vehicle_type ?? null,
    progress_stage: mapProgressStage(order.status, delivery),
    progress_percent: STATUS_PROGRESS[order.status] ?? null,
    seller_name: sellerName ?? null,
  };
}
