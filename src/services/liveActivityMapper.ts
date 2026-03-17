import type { LiveActivityData } from '@/plugins/live-activity/definitions';

/**
 * Builds a LiveActivityData payload from an order row and optional
 * delivery assignment data. Works without any React hooks.
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
    progress_stage: order.status,
  };
}
