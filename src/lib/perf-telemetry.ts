/**
 * Lightweight performance telemetry for critical paths.
 * Uses `performance.mark` / `performance.measure` — zero overhead when
 * Performance API is unavailable (SSR, older browsers).
 */

const HAS_PERF = typeof performance !== 'undefined' && typeof performance.mark === 'function';

/**
 * Start a named performance measurement.
 */
export function markStart(label: string): void {
  if (!HAS_PERF) return;
  try {
    performance.mark(`${label}:start`);
  } catch {
    // ignore
  }
}

/**
 * End a named performance measurement and log the duration.
 * Returns duration in ms, or -1 if measurement failed.
 */
export function markEnd(label: string): number {
  if (!HAS_PERF) return -1;
  try {
    performance.mark(`${label}:end`);
    const measure = performance.measure(label, `${label}:start`, `${label}:end`);
    const duration = measure.duration;

    if (duration > 500) {
      console.warn(`[Perf] ${label}: ${duration.toFixed(0)}ms (slow)`);
    } else if (import.meta.env.DEV) {
      console.debug(`[Perf] ${label}: ${duration.toFixed(0)}ms`);
    }

    // Cleanup marks
    performance.clearMarks(`${label}:start`);
    performance.clearMarks(`${label}:end`);
    performance.clearMeasures(label);

    return duration;
  } catch {
    return -1;
  }
}

/**
 * Wraps an async function with automatic start/end marks.
 */
export async function withTelemetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  markStart(label);
  try {
    return await fn();
  } finally {
    markEnd(label);
  }
}
