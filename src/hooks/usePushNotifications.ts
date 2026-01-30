import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function usePushNotifications() {
  const [token, setToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { user } = useAuth();
  const navigate = useNavigate();

  const saveTokenToDatabase = useCallback(async (pushToken: string) => {
    if (!user) return;

    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    
    try {
      // Upsert the token (insert or update if exists)
      const { error } = await supabase
        .from('device_tokens')
        .upsert(
          {
            user_id: user.id,
            token: pushToken,
            platform,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,token',
          }
        );

      if (error) {
        console.error('Error saving push token:', error);
      }
    } catch (err) {
      console.error('Failed to save push token:', err);
    }
  }, [user]);

  const removeTokenFromDatabase = useCallback(async () => {
    if (!user || !token) return;

    try {
      const { error } = await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('token', token);

      if (error) {
        console.error('Error removing push token:', error);
      }
    } catch (err) {
      console.error('Failed to remove push token:', err);
    }
  }, [user, token]);

  const registerPushNotifications = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      console.log('Push notifications only available on native platforms');
      return;
    }

    try {
      // Check current permission status
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        setPermissionStatus('denied');
        console.log('Push notification permission denied');
        return;
      }

      setPermissionStatus('granted');

      // Register for push notifications
      await PushNotifications.register();
    } catch (err) {
      console.error('Error registering for push notifications:', err);
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;

    // Set up listeners
    const registrationListener = PushNotifications.addListener(
      'registration',
      (registrationToken) => {
        console.log('Push registration success, token:', registrationToken.value);
        setToken(registrationToken.value);
        saveTokenToDatabase(registrationToken.value);
      }
    );

    const registrationErrorListener = PushNotifications.addListener(
      'registrationError',
      (error) => {
        console.error('Push registration error:', error.error);
      }
    );

    const notificationReceivedListener = PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('Push notification received:', notification);
        // Handle foreground notification (show toast, update UI, etc.)
      }
    );

    const notificationActionListener = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (notification) => {
        console.log('Push notification action performed:', notification);
        // Navigate based on notification data
        const data = notification.notification.data;
        if (data?.orderId) {
          navigate(`/orders/${data.orderId}`);
        } else if (data?.type === 'order') {
          navigate('/orders');
        }
      }
    );

    // Register for push notifications
    registerPushNotifications();

    // Cleanup listeners on unmount
    return () => {
      registrationListener.then(l => l.remove());
      registrationErrorListener.then(l => l.remove());
      notificationReceivedListener.then(l => l.remove());
      notificationActionListener.then(l => l.remove());
    };
  }, [user, registerPushNotifications, saveTokenToDatabase, navigate]);

  return {
    token,
    permissionStatus,
    registerPushNotifications,
    removeTokenFromDatabase,
  };
}
