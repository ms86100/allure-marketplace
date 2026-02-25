import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * B2: Lightweight hook that only returns cart item count.
 * Components that only need the badge count (e.g. BottomNav) use this
 * instead of the full useCart() to avoid re-renders on cart content changes.
 */
export function useCartCount() {
  const { user } = useAuth();

  const { data: itemCount = 0 } = useQuery({
    queryKey: ['cart-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('cart_items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30s — lightweight polling-friendly
  });

  return itemCount;
}
