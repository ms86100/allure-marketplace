/**
 * Capacitor Plugin: LiveActivity
 *
 * Bridge between the Sociva web layer and native iOS (ActivityKit) /
 * Android (Foreground Service) lock-screen live activities.
 */

export interface LiveActivityData {
  /** Discriminator: "order" | "booking" */
  entity_type: string;
  /** UUID of the order or booking */
  entity_id: string;
  /** Current workflow status key */
  workflow_status: string;
  /** Estimated time of arrival in minutes (null if unknown) */
  eta_minutes: number | null;
  /** Distance to destination in kilometres (null if unknown) */
  driver_distance: number | null;
  /** Rider / driver display name */
  driver_name: string | null;
  /** Vehicle type label, e.g. "Bike", "Car" */
  vehicle_type: string | null;
  /** Human-readable progress stage, e.g. "Preparing → Picked Up → On the way" */
  progress_stage: string | null;
}

export interface LiveActivityPlugin {
  /**
   * Start a new lock-screen live activity.
   * Returns a platform-specific activity identifier used for future updates.
   */
  startLiveActivity(data: LiveActivityData): Promise<{ activityId: string }>;

  /**
   * Push an update to the currently-active live activity.
   * If no activity is active for `entity_id`, this is a no-op.
   */
  updateLiveActivity(data: LiveActivityData): Promise<void>;

  /**
   * End (dismiss) the live activity for a given entity.
   */
  endLiveActivity(opts: { activityId: string }): Promise<void>;
}
