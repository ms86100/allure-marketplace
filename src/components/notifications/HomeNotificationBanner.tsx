import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLatestActionNotification, useMarkNotificationRead } from '@/hooks/queries/useNotifications';
import { RichNotificationCard } from './RichNotificationCard';
import { motion, AnimatePresence } from 'framer-motion';

const DISMISSED_KEY = 'home_banner_dismissed_ids';
const MAX_STORED = 50;

/** Read dismissed IDs from localStorage — survives navigation & remounts */
function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function addDismissedId(id: string) {
  const set = getDismissedIds();
  set.add(id);
  // Cap storage to prevent unbounded growth
  const arr = [...set].slice(-MAX_STORED);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
  } catch { /* quota exceeded — harmless */ }
}

export function HomeNotificationBanner() {
  const { user } = useAuth();
  const { data: notification } = useLatestActionNotification(user?.id);
  const markRead = useMarkNotificationRead();
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(getDismissedIds);

  // Sync from localStorage on mount and when notification changes
  useEffect(() => {
    setLocalDismissed(getDismissedIds());
  }, [notification?.id]);

  const handleDismiss = useCallback(() => {
    if (!notification) return;
    // 1. Persist to localStorage immediately (survives unmount)
    addDismissedId(notification.id);
    // 2. Update local state to hide instantly
    setLocalDismissed(prev => new Set(prev).add(notification.id));
    // 3. Mark as read in DB (async — belt & suspenders)
    markRead.mutate(notification.id);
  }, [notification, markRead]);

  if (!notification || localDismissed.has(notification.id)) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={notification.id}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3 }}
        className="px-4 mt-3"
      >
        <RichNotificationCard
          notification={notification}
          onDismiss={handleDismiss}
        />
      </motion.div>
    </AnimatePresence>
  );
}
