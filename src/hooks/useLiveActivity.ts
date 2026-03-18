import { useEffect, useRef } from 'react';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import type { LiveActivityData } from '@/plugins/live-activity/definitions';

interface UseLiveActivityOptions {
  /** Entity type: "order" | "booking" */
  entityType: string;
  /** Entity UUID */
  entityId: string | undefined;
  /** Current workflow status */
  status: string | null;
  /** ETA in minutes */
  eta: number | null;
  /** Distance in km */
  distance: number | null;
  /** Rider / driver name */
  driverName: string | null;
  /** Vehicle type */
  vehicleType: string | null;
  /** Human-readable progress stage */
  progressStage: string | null;
}

/**
 * Hook that bridges order/booking state into the native
 * lock-screen Live Activity via LiveActivityManager.
 *
 * Mount in OrderDetailPage — it reacts to delivery tracking
 * and order status changes automatically.
 */
export function useLiveActivity(opts: UseLiveActivityOptions): void {
  const { entityType, entityId, status, eta, distance, driverName, vehicleType, progressStage } = opts;

  // Track previous entityId to clean up on unmount or entity change
  const prevEntityId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!entityId || !status) return;

    const data: LiveActivityData = {
      entity_type: entityType,
      entity_id: entityId,
      workflow_status: status,
      eta_minutes: eta,
      driver_distance: distance,
      driver_name: driverName,
      vehicle_type: vehicleType,
      progress_stage: progressStage,
      progress_percent: null,
      seller_name: null,
    };

    LiveActivityManager.push(data);
  }, [entityType, entityId, status, eta, distance, driverName, vehicleType, progressStage]);

  // Cleanup on unmount or entity change
  useEffect(() => {
    const prev = prevEntityId.current;
    prevEntityId.current = entityId;

    return () => {
      if (prev) {
        LiveActivityManager.end(prev);
      }
    };
  }, [entityId]);
}
