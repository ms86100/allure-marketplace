import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isCircuitOpen } from '@/lib/circuitBreaker';

const SELLER_ONLY_TYPES = [
  'settlement', 'seller_approved', 'seller_rejected', 'seller_suspended',
  'product_approved', 'product_rejected', 'license_approved', 'license_rejected',
] as const;
const SELLER_ONLY_FILTER = `(${SELLER_ONLY_TYPES.join(',')})`;


export function useUnreadNotificationCount() {
  const { user } = useAuth();

  const { data: count = 0 } = useQuery({
    queryKey: ['unread-notifications', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .not('type', 'in', SELLER_ONLY_FILTER)
        .not('payload->>target_role', 'eq', 'seller');
      return count || 0;
    },
    enabled: !!user,
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.status === 'error' || isCircuitOpen('notifications') ? false : 30_000,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
  });

  return count;
}
