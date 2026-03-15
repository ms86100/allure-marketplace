import { Capacitor } from '@capacitor/core';
import { LiveActivity } from '@/plugins/live-activity';
import type { LiveActivityData } from '@/plugins/live-activity/definitions';

/** Terminal workflow statuses that should end any live activity */
const TERMINAL_STATUSES = new Set([
  'delivered',
  'completed',
  'cancelled',
  'no_show',
  'failed',
]);

/** Statuses that should start a live activity if one is not already active */
const START_STATUSES = new Set([
  'accepted',
  'picked_up',
  'confirmed',
  'preparing',
  'en_route',
  'ready',
]);

const THROTTLE_MS = 5_000;

interface ActiveEntry {
  activityId: string;
  entityId: string;
  lastUpdate: number;
  pendingTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Singleton manager that coordinates lock-screen live activities.
 *
 * Safety guarantees:
 * - Only one activity per entity at a time (dedup by entity_id)
 * - Updates throttled to max 1 per 5 seconds
 * - Graceful degradation on web (no-op plugin)
 * - Auto-cleanup on terminal status
 * - Reconciles with native state on first push (prevents duplicates after app restart)
 */
class _LiveActivityManager {
  private active = new Map<string, ActiveEntry>();
  private hydrated = false;

  /** True only on native iOS / Android */
  private get isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Reconcile in-memory Map with native ActivityKit state.
   * Called once on first push() to prevent orphaned / duplicate activities.
   */
  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    try {
      const { activities } = await LiveActivity.getActiveActivities();
      const knownEntityIds = new Set(this.active.keys());

      for (const { activityId, entityId } of activities) {
        if (!knownEntityIds.has(entityId)) {
          // Native activity exists but manager doesn't know about it — track it
          this.active.set(entityId, {
            activityId,
            entityId,
            lastUpdate: Date.now(),
            pendingTimer: null,
          });
        }
      }
    } catch (e) {
      console.warn('[LiveActivityManager] hydrate failed:', e);
    }
  }

  /** Start or update a live activity based on workflow status */
  async push(data: LiveActivityData): Promise<void> {
    if (!this.isSupported) return;

    await this.hydrate();

    const { entity_id, workflow_status } = data;

    // Terminal → end activity
    if (TERMINAL_STATUSES.has(workflow_status)) {
      await this.end(entity_id);
      return;
    }

    const existing = this.active.get(entity_id);

    // No active entry and status qualifies → start
    if (!existing && START_STATUSES.has(workflow_status)) {
      try {
        const { activityId } = await LiveActivity.startLiveActivity(data);
        this.active.set(entity_id, {
          activityId,
          entityId: entity_id,
          lastUpdate: Date.now(),
          pendingTimer: null,
        });
      } catch (e) {
        console.warn('[LiveActivityManager] start failed:', e);
      }
      return;
    }

    // Active entry exists → throttled update
    if (existing) {
      this.throttledUpdate(existing, data);
    }
  }

  /** End the live activity for an entity */
  async end(entityId: string): Promise<void> {
    const entry = this.active.get(entityId);
    if (!entry) return;

    if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
    this.active.delete(entityId);

    try {
      await LiveActivity.endLiveActivity({ activityId: entry.activityId });
    } catch (e) {
      console.warn('[LiveActivityManager] end failed:', e);
    }
  }

  /** End all active activities (e.g. on logout) */
  async endAll(): Promise<void> {
    const ids = Array.from(this.active.keys());
    await Promise.all(ids.map((id) => this.end(id)));
  }

  // ── internal ──────────────────────────────────────────────

  private throttledUpdate(entry: ActiveEntry, data: LiveActivityData): void {
    const elapsed = Date.now() - entry.lastUpdate;

    if (elapsed >= THROTTLE_MS) {
      this.doUpdate(entry, data);
      return;
    }

    // Schedule deferred update (replaces any pending)
    if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
    entry.pendingTimer = setTimeout(() => {
      this.doUpdate(entry, data);
    }, THROTTLE_MS - elapsed);
  }

  private async doUpdate(entry: ActiveEntry, data: LiveActivityData): Promise<void> {
    entry.lastUpdate = Date.now();
    entry.pendingTimer = null;
    try {
      await LiveActivity.updateLiveActivity(data);
    } catch (e) {
      console.warn('[LiveActivityManager] update failed:', e);
    }
  }
}

export const LiveActivityManager = new _LiveActivityManager();
