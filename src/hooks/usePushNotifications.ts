import { useEffect, useState, useCallback, useContext, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { IdentityContext } from '@/contexts/auth/contexts';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { hapticNotification } from '@/lib/haptics';

export function usePushNotifications() {
  const [token, setToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const identity = useContext(IdentityContext);
  const user = identity?.user ?? null;
  const navigate = useNavigate();
  // Keep a ref to the latest user so the registration callback can access it
  const userRef = useRef(user);
  userRef.current = user;

  const saveTokenToDatabase = useCallback(async (pushToken: string) => {
    const currentUser = userRef.current;
    console.log('[Push] saveTokenToDatabase called, user:', currentUser?.id ?? 'null', 'token:', pushToken.slice(0, 20) + '…');

    if (!currentUser) {
      console.warn('[Push] No user at token-save time — will retry when user is ready');
      return false;
    }

    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

    try {
      const { error, data } = await supabase
        .from('device_tokens')
        .upsert(
          {
            user_id: currentUser.id,
            token: pushToken,
            platform,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,token' }
        )
        .select();

      if (error) {
        console.error('[Push] Token save FAILED:', error.message, error.code, error.details);
        return false;
      }
      console.log('[Push] Token saved successfully:', data);
      return true;
    } catch (err) {
      console.error('[Push] Token save exception:', err);
      return false;
    }
  }, []);

  const removeTokenFromDatabase = useCallback(async () => {
    if (!user || !token) return;

    try {
      const { error } = await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('token', token);

      if (error) {
        console.error('[Push] Error removing push token:', error);
      }
    } catch (err) {
      console.error('[Push] Failed to remove push token:', err);
    }
  }, [user, token]);

  const registerPushNotifications = useCallback(async () => {
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();
    console.log('[Push] registerPushNotifications called — isNative:', isNative, 'platform:', platform);

    if (!isNative) {
      console.log('[Push] Skipping — not a native platform');
      return;
    }

    try {
      let permStatus = await PushNotifications.checkPermissions();
      console.log('[Push] Current permission:', permStatus.receive);

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
        console.log('[Push] After request:', permStatus.receive);
      }

      if (permStatus.receive !== 'granted') {
        setPermissionStatus('denied');
        console.log('[Push] Permission denied');
        return;
      }

      setPermissionStatus('granted');
      console.log('[Push] Calling PushNotifications.register()…');
      await PushNotifications.register();
      console.log('[Push] register() completed');
    } catch (err) {
      console.error('[Push] Registration error:', err);
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // We still set up listeners even without user so we can capture the token early
    const registrationListener = PushNotifications.addListener(
      'registration',
      async (registrationToken) => {
        console.log('[Push] registration event — token:', registrationToken.value.slice(0, 20) + '…');
        setToken(registrationToken.value);

        // Try to save immediately
        const saved = await saveTokenToDatabase(registrationToken.value);
        if (!saved) {
          console.log('[Push] Token save deferred — will retry when user becomes available');
        }
      }
    );

    const registrationErrorListener = PushNotifications.addListener(
      'registrationError',
      (error) => {
        console.error('[Push] registrationError:', JSON.stringify(error));
      }
    );

    // ── Foreground notification: show toast + sound + haptic ──
    const notificationReceivedListener = PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('[Push] Foreground notification received:', JSON.stringify(notification));

        hapticNotification('warning');

        // Play a short alarm sound
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = i % 2 === 0 ? 880 : 660;
            osc.type = 'square';
            const start = ctx.currentTime + i * 0.2;
            gain.gain.setValueAtTime(0.25, start);
            gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18);
            osc.start(start);
            osc.stop(start + 0.2);
          }
          // Close audio context after sounds finish
          setTimeout(() => ctx.close().catch(() => {}), 1000);
        } catch (e) {
          console.warn('[Push] Sound failed:', e);
        }

        const title = notification.title || 'New Notification';
        const body = notification.body || '';
        const data = notification.data as Record<string, string> | undefined;

        toast(title, {
          description: body,
          duration: 10000,
          action: data?.orderId
            ? {
                label: 'View',
                onClick: () => navigate(`/orders/${data.orderId}`),
              }
            : undefined,
        });
      }
    );

    const notificationActionListener = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (notification) => {
        console.log('[Push] Action performed:', JSON.stringify(notification));
        const data = notification.notification.data;
        if (data?.orderId) {
          navigate(`/orders/${data.orderId}`);
        } else if (data?.type === 'order') {
          navigate('/orders');
        }
      }
    );

    // Register if user is ready, otherwise wait
    if (user) {
      registerPushNotifications();
    }

    return () => {
      registrationListener.then(l => l.remove());
      registrationErrorListener.then(l => l.remove());
      notificationReceivedListener.then(l => l.remove());
      notificationActionListener.then(l => l.remove());
    };
  }, [user, registerPushNotifications, saveTokenToDatabase, navigate]);

  // ── Retry token save when user becomes available and we already have a token ──
  useEffect(() => {
    if (user && token) {
      console.log('[Push] User now available — retrying token save');
      saveTokenToDatabase(token);
    }
  }, [user, token, saveTokenToDatabase]);

  return {
    token,
    permissionStatus,
    registerPushNotifications,
    removeTokenFromDatabase,
  };
}
