import { useEffect } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/contexts/AuthContext';

interface PushNotificationProviderProps {
  children: React.ReactNode;
}

export function PushNotificationProvider({ children }: PushNotificationProviderProps) {
  const { user } = useAuth();
  const { removeTokenFromDatabase } = usePushNotifications();

  // Clean up tokens on logout
  useEffect(() => {
    if (!user) {
      removeTokenFromDatabase();
    }
  }, [user, removeTokenFromDatabase]);

  return <>{children}</>;
}
