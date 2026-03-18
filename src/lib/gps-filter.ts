/**
 * GPS noise filter with teleport rejection and exponential smoothing.
 * Inspired by Kalman-lite approaches used in delivery tracking apps.
 */

interface GPSPoint {
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  heading: number | null;
  recorded_at: string;
}

interface FilterState {
  lastAccepted: GPSPoint | null;
  smoothedLat: number | null;
  smoothedLng: number | null;
}

const MAX_SPEED_KMH = 120; // Reject teleports above this speed
const SMOOTHING_FACTOR = 0.7; // Weight for new point (0.3 for previous)
const MIN_MOVEMENT_METERS = 1; // Lowered from 3m — 3m was too aggressive for slow-moving riders

/** Haversine distance in meters */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Filter a new GPS point against previous state.
 * Returns null if the point should be rejected (teleport), or
 * a smoothed point if accepted.
 */
export function filterGPSPoint(
  point: GPSPoint,
  state: FilterState
): { accepted: boolean; filtered: GPSPoint; newState: FilterState } {
  const { lastAccepted, smoothedLat, smoothedLng } = state;

  // First point — accept as-is
  if (!lastAccepted || smoothedLat == null || smoothedLng == null) {
    return {
      accepted: true,
      filtered: point,
      newState: {
        lastAccepted: point,
        smoothedLat: point.latitude,
        smoothedLng: point.longitude,
      },
    };
  }

  const distMeters = haversine(
    lastAccepted.latitude,
    lastAccepted.longitude,
    point.latitude,
    point.longitude
  );

  // Micro-jitter rejection
  if (distMeters < MIN_MOVEMENT_METERS) {
    return {
      accepted: false,
      filtered: { ...point, latitude: smoothedLat, longitude: smoothedLng },
      newState: state,
    };
  }

  // Teleport rejection: compute implied speed
  const timeDiffMs =
    new Date(point.recorded_at).getTime() -
    new Date(lastAccepted.recorded_at).getTime();
  if (timeDiffMs > 0) {
    const impliedSpeedKmh = (distMeters / 1000) / (timeDiffMs / 3600000);
    if (impliedSpeedKmh > MAX_SPEED_KMH) {
      // Reject — keep previous smoothed position
      return {
        accepted: false,
        filtered: { ...point, latitude: smoothedLat, longitude: smoothedLng },
        newState: state,
      };
    }
  }

  // Exponential smoothing
  const newSmoothedLat = SMOOTHING_FACTOR * point.latitude + (1 - SMOOTHING_FACTOR) * smoothedLat;
  const newSmoothedLng = SMOOTHING_FACTOR * point.longitude + (1 - SMOOTHING_FACTOR) * smoothedLng;

  const filtered: GPSPoint = {
    ...point,
    latitude: newSmoothedLat,
    longitude: newSmoothedLng,
  };

  return {
    accepted: true,
    filtered,
    newState: {
      lastAccepted: point,
      smoothedLat: newSmoothedLat,
      smoothedLng: newSmoothedLng,
    },
  };
}

export type { GPSPoint, FilterState };
