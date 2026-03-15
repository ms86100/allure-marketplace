import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLatestActionNotification } from '@/hooks/queries/useNotifications';
import { RichNotificationCard } from './RichNotificationCard';
import { motion, AnimatePresence } from 'framer-motion';

export function HomeNotificationBanner() {
  const { user } = useAuth();
  const { data: notification } = useLatestActionNotification(user?.id);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Reset dismissed state when a new notification arrives
  useEffect(() => {
    if (notification && notification.id !== dismissed) {
      setDismissed(null);
    }
  }, [notification?.id]);

  if (!notification || dismissed === notification.id) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3 }}
        className="px-4 mt-3"
      >
        <RichNotificationCard
          notification={notification}
          onDismiss={() => setDismissed(notification.id)}
        />
      </motion.div>
    </AnimatePresence>
  );
}
