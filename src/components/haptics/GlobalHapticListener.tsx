import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Global click listener that triggers a subtle haptic "tick" on every
 * interactive element tap (links, buttons, inputs, etc.) — mimicking
 * the tactile feedback found in apps like Blinkit.
 */
export function GlobalHapticListener() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const INTERACTIVE_SELECTORS = 'a, button, [role="button"], [role="tab"], [role="menuitem"], [role="link"], input, select, textarea, [data-haptic]';

    let hapticsModule: typeof import('@capacitor/haptics') | null = null;

    // Pre-load the module so clicks feel instant
    import('@capacitor/haptics').then((mod) => {
      hapticsModule = mod;
    });

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const interactive = target.closest(INTERACTIVE_SELECTORS);
      if (interactive && hapticsModule) {
        hapticsModule.Haptics.selectionChanged();
      }
    };

    // Use capture phase so we fire before any stopPropagation
    document.addEventListener('click', handleClick, { capture: true, passive: true });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true } as EventListenerOptions);
    };
  }, []);

  return null;
}
