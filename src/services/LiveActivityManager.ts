import { Capacitor } from '@capacitor/core';
import { LiveActivity } from '@/plugins/live-activity';
import type { LiveActivityData } from '@/plugins/live-activity/definitions';
import { getString, setString, removeKey } from '@/lib/persistent-kv';

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

  /**
   * Reconcile in-memory Map with persisted state and native ActivityKit state.
   * Called once on first push() to prevent orphaned / duplicate activities.
   *
   * Order: load persisted → query native → cleanup stale → ready
   */
  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    try {
      // Step 1: Restore from persistent storage
      const persisted = this.loadPersistedMap();
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

      // Step 2: Query native activities and reconcile
      const { activities } = await LiveActivity.getActiveActivities();
      const nativeEntityIds = new Set<string>();

      for (const { activityId, entityId } of activities) {
        nativeEntityIds.add(entityId);
        const existing = this.active.get(entityId);
        if (!existing) {
          // Native activity exists but we don't know about it — track it
          this.active.set(entityId, {
            activityId,
            entityId,
            lastUpdate: Date.now(),
            pendingTimer: null,
          });
        } else if (existing.activityId !== activityId) {
          // Activity ID mismatch (stale persisted data) — update to native truth
          existing.activityId = activityId;
        }
      }

      // Step 3: Remove entries that exist in our map but not natively
      // (they were already dismissed by the OS or user)
      for (const [entityId] of this.active) {
        if (!nativeEntityIds.has(entityId)) {
          this.active.delete(entityId);
        }
      }

      // Step 4: Cleanup stale native activities not in our valid set
      const validIds = Array.from(this.active.keys());
      await LiveActivity.cleanupStaleActivities({ validEntityIds: validIds });

      // Persist reconciled state
      this.persistMap();
    } catch (e) {
      console.warn('[LiveActivityManager] hydrate failed:', e);
    }
  }

  // ── Map size guard ───────────────────────────────────────

  private enforceMaxActive(): void {
    if (this.active.size <= MAX_ACTIVE) return;

    // Find the oldest entry by lastUpdate and remove it
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [entityId, entry] of this.active) {
      if (entry.lastUpdate < oldestTime) {
        oldestTime = entry.lastUpdate;
        oldestKey = entityId;
      }
    }
    if (oldestKey) {
      void this.end(oldestKey);
    }
  }

  // ── Public API ───────────────────────────────────────────

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
        this.persistMap();
        this.enforceMaxActive();
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
    this.persistMap();

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
    this.clearPersistedMap();
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
