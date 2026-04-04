import { supabase } from '@/integrations/supabase/client';
import { isBackendDown } from '@/lib/circuitBreaker';

/**
 * Gated wrapper around process-notification-queue invocation.
 * Silently skips when backend is down — cron will catch up later.
 */
export function fireNotificationQueue(): void {
  if (isBackendDown()) return;
  supabase.functions.invoke('process-notification-queue').catch(() => {});
}
