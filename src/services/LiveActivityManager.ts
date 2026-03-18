import { Capacitor } from '@capacitor/core';
import { LiveActivity } from '@/plugins/live-activity';
import type { LiveActivityData } from '@/plugins/live-activity/definitions';
import { getString, setString, removeKey } from '@/lib/persistent-kv';
import { recordLAError } from '@/services/liveActivityDiagnostics';

const TAG = '[LiveActivity]';

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
  'on_the_way',
  'ready',
]);

const THROTTLE_MS = 5_000;
const STORAGE_KEY = 'live_activity_map';
const MAX_ACTIVE = 10;

interface ActiveEntry {
  activityId: string;
  entityId: string;
  lastUpdate: number;
  pendingTimer: ReturnType<typeof setTimeout> | null;
}

interface PersistedMap {
  version: number;
  activities: Record<string, string>; // entityId → activityId
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
 * - Persistent activity map survives app restarts
 * - Stale activities cleaned up before new ones are created
 * - Map capped at MAX_ACTIVE entries
 */
class _LiveActivityManager {
  private active = new Map<string, ActiveEntry>();
  private hydrated = false;

  /** True only on native iOS / Android */
  private get isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  // ── Persistence ──────────────────────────────────────────

  private loadPersistedMap(): Record<string, string> {
    try {
      const raw = getString(STORAGE_KEY);
      if (!raw) return {};
      const parsed: PersistedMap = JSON.parse(raw);
      if (parsed.version !== 1) return {};
      return parsed.activities ?? {};
    } catch {
      return {};
    }
  }

  private persistMap(): void {
    const activities: Record<string, string> = {};
    for (const [entityId, entry] of this.active) {
      activities[entityId] = entry.activityId;
    }
    const data: PersistedMap = { version: 1, activities };
    setString(STORAGE_KEY, JSON.stringify(data));
  }

  private clearPersistedMap(): void {
    removeKey(STORAGE_KEY);
  }

  // ── Hydration & Cleanup ──────────────────────────────────

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    console.log(TAG, 'HYDRATE START — reconciling persisted + native state');

    try {
      const persisted = this.loadPersistedMap();
      const persistedCount = Object.keys(persisted).length;
      console.log(TAG, `HYDRATE persisted entries: ${persistedCount}`);

      for (const [entityId, activityId] of Object.entries(persisted)) {
        if (!this.active.has(entityId)) {
          this.active.set(entityId, {
            activityId,
            entityId,
            lastUpdate: Date.now(),
            pendingTimer: null,
          });
        }
      }

      const { activities } = await LiveActivity.getActiveActivities();
      console.log(TAG, `HYDRATE native activities: ${activities.length}`);
      const nativeEntityIds = new Set<string>();

      for (const { activityId, entityId } of activities) {
        nativeEntityIds.add(entityId);
        const existing = this.active.get(entityId);
        if (!existing) {
          this.active.set(entityId, {
            activityId,
            entityId,
            lastUpdate: Date.now(),
            pendingTimer: null,
          });
        } else if (existing.activityId !== activityId) {
          existing.activityId = activityId;
        }
      }

      // Remove entries that exist in our map but not natively
      for (const [entityId] of this.active) {
        if (!nativeEntityIds.has(entityId)) {
          console.log(TAG, `HYDRATE removing stale entry: ${entityId}`);
          this.active.delete(entityId);
        }
      }

      const validIds = Array.from(this.active.keys());
      await LiveActivity.cleanupStaleActivities({ validEntityIds: validIds });

      this.persistMap();
      console.log(TAG, `HYDRATE COMPLETE — tracking ${this.active.size} activities`);
    } catch (e) {
      console.warn(TAG, 'HYDRATE FAILED:', e);
    }
  }

  // ── Map size guard ───────────────────────────────────────

  private enforceMaxActive(): void {
    if (this.active.size <= MAX_ACTIVE) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [entityId, entry] of this.active) {
      if (entry.lastUpdate < oldestTime) {
        oldestTime = entry.lastUpdate;
        oldestKey = entityId;
      }
    }
    if (oldestKey) {
      console.log(TAG, `MAX_ACTIVE exceeded, evicting oldest: ${oldestKey}`);
      void this.end(oldestKey);
    }
  }

  // ── Public API ───────────────────────────────────────────

  /** Start or update a live activity based on workflow status */
  async push(data: LiveActivityData): Promise<void> {
    console.log(TAG, `TRIGGER entity=${data.entity_id} status=${data.workflow_status} native=${this.isSupported}`);

    if (!this.isSupported) {
      console.log(TAG, 'SKIP — not a native platform');
      return;
    }

    await this.hydrate();

    const { entity_id, workflow_status } = data;

    // Terminal → end activity
    if (TERMINAL_STATUSES.has(workflow_status)) {
      console.log(TAG, `END (terminal) entity=${entity_id} status=${workflow_status}`);
      await this.end(entity_id);
      return;
    }

    const existing = this.active.get(entity_id);

    // No active entry and status qualifies → start
    if (!existing && START_STATUSES.has(workflow_status)) {
      try {
        console.log(TAG, `START entity=${entity_id} status=${workflow_status}`);
        const { activityId } = await LiveActivity.startLiveActivity(data);
        console.log(TAG, `START SUCCESS entity=${entity_id} activityId=${activityId}`);
        this.active.set(entity_id, {
          activityId,
          entityId: entity_id,
          lastUpdate: Date.now(),
          pendingTimer: null,
        });
        this.persistMap();
        this.enforceMaxActive();
      } catch (e) {
        recordLAError('START', entity_id, e);
      }
      return;
    }

    // Active entry exists → throttled update
    if (existing) {
      console.log(TAG, `UPDATE (throttled) entity=${entity_id} status=${workflow_status}`);
      this.throttledUpdate(existing, data);
    } else {
      console.log(TAG, `SKIP — no active entry and status '${workflow_status}' not in START_STATUSES`);
    }
  }

  /** End the live activity for an entity */
  async end(entityId: string): Promise<void> {
    const entry = this.active.get(entityId);
    if (!entry) {
      console.log(TAG, `END SKIP — no active entry for ${entityId}`);
      return;
    }

    if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
    this.active.delete(entityId);
    this.persistMap();

    try {
      console.log(TAG, `END entity=${entityId} activityId=${entry.activityId}`);
      await LiveActivity.endLiveActivity({ activityId: entry.activityId });
      console.log(TAG, `END SUCCESS entity=${entityId}`);
    } catch (e) {
      console.error(TAG, `END FAILED entity=${entityId}:`, e);
    }
  }

  /** End all active activities (e.g. on logout) */
  async endAll(): Promise<void> {
    console.log(TAG, `END ALL — ${this.active.size} activities`);
    const ids = Array.from(this.active.keys());
    await Promise.all(ids.map((id) => this.end(id)));
    this.clearPersistedMap();
  }

  /** Force re-hydration (e.g. on app resume) */
  resetHydration(): void {
    this.hydrated = false;
  }

  // ── internal ──────────────────────────────────────────────

  private throttledUpdate(entry: ActiveEntry, data: LiveActivityData): void {
    const elapsed = Date.now() - entry.lastUpdate;

    if (elapsed >= THROTTLE_MS) {
      this.doUpdate(entry, data);
      return;
    }

    if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
    entry.pendingTimer = setTimeout(() => {
      this.doUpdate(entry, data);
    }, THROTTLE_MS - elapsed);
  }

  private async doUpdate(entry: ActiveEntry, data: LiveActivityData): Promise<void> {
    entry.lastUpdate = Date.now();
    entry.pendingTimer = null;
    try {
      console.log(TAG, `UPDATE EXEC entity=${data.entity_id} status=${data.workflow_status}`);
      await LiveActivity.updateLiveActivity(data);
      console.log(TAG, `UPDATE SUCCESS entity=${data.entity_id}`);
    } catch (e) {
      console.error(TAG, `UPDATE FAILED entity=${data.entity_id}:`, e);
    }
  }
}

export const LiveActivityManager = new _LiveActivityManager();
