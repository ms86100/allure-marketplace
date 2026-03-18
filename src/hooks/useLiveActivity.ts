import { useEffect } from 'react';
import { LiveActivityManager } from '@/services/LiveActivityManager';
import { buildLiveActivityData } from '@/services/liveActivityMapper';

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
  /** Seller / business name */
  sellerName: string | null;
}

/**
 * Hook that bridges order/booking state into the native
 * lock-screen Live Activity via LiveActivityManager.
 *
 * Mount in OrderDetailPage — it reacts to delivery tracking
 * and order status changes automatically.
 *
 * NOTE: This hook only pushes updates. The orchestrator
 * (useLiveActivityOrchestrator) owns the full lifecycle
 * including start and end — never end activities here.
 */
export function useLiveActivity(opts: UseLiveActivityOptions): void {
  const { entityType, entityId, status, eta, distance, driverName, vehicleType, progressStage, sellerName } = opts;

  useEffect(() => {
    if (!entityId || !status) return;

    const order = { id: entityId, status, seller_id: null };
    const delivery = {
      eta_minutes: eta,
      distance_meters: distance ? distance * 1000 : null,
      rider_name: driverName,
    };

    const data = buildLiveActivityData(order, delivery, sellerName);
    LiveActivityManager.push(data);
  }, [entityType, entityId, status, eta, distance, driverName, vehicleType, progressStage, sellerName]);
}
