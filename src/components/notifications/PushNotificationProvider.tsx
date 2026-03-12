import { useEffect, useRef } from 'react';
import { usePushNotificationsInternal } from '@/hooks/usePushNotifications';
import { PushNotificationContext } from '@/contexts/PushNotificationContext';

interface PushNotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Single provider that owns ALL push notification side effects.
 * Must be mounted exactly once in the component tree (App.tsx).
 *
 * Token cleanup now happens ONLY on explicit sign-out (via custom event),
 * NOT on any user→null transition (which can happen during transient auth drops).
 */
export function PushNotificationProvider({ children }: PushNotificationProviderProps) {
  // This is the ONLY place the full hook (with listeners + effects) runs
  const pushState = usePushNotificationsInternal();
  const removeRef = useRef(pushState.removeTokenFromDatabase);
  removeRef.current = pushState.removeTokenFromDatabase;

  // Listen for explicit sign-out event only
  useEffect(() => {
    const handler = () => {
      console.log('[PushProvider] Explicit sign-out detected — removing device token');
      removeRef.current();
    };
    window.addEventListener('app:explicit-signout', handler);
    return () => window.removeEventListener('app:explicit-signout', handler);
  }, []);

  return (
    <PushNotificationContext.Provider value={pushState}>
      {children}
    </PushNotificationContext.Provider>
  );
}
