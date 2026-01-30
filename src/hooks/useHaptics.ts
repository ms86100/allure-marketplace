import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

type ImpactStyle = 'light' | 'medium' | 'heavy';
type NotificationType = 'success' | 'warning' | 'error';

/**
 * Hook for triggering haptic feedback on native platforms.
 * Falls back to no-op on web.
 */
export function useHaptics() {
  const impact = useCallback(async (style: ImpactStyle = 'medium') => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      
      const styleMap = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      
      await Haptics.impact({ style: styleMap[style] });
    } catch (error) {
      console.error('Haptics error:', error);
    }
  }, []);

  const notification = useCallback(async (type: NotificationType = 'success') => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      
      const typeMap = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      };
      
      await Haptics.notification({ type: typeMap[type] });
    } catch (error) {
      console.error('Haptics error:', error);
    }
  }, []);

  const vibrate = useCallback(async (duration: number = 300) => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { Haptics } = await import('@capacitor/haptics');
      await Haptics.vibrate({ duration });
    } catch (error) {
      console.error('Haptics error:', error);
    }
  }, []);

  const selectionChanged = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { Haptics } = await import('@capacitor/haptics');
      await Haptics.selectionChanged();
    } catch (error) {
      console.error('Haptics error:', error);
    }
  }, []);

  return {
    impact,
    notification,
    vibrate,
    selectionChanged,
  };
}
