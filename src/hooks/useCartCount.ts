import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * B2: Lightweight hook that returns total quantity of items in cart.
 * Components that only need the badge count (e.g. BottomNav) use this
 * instead of the full useCart() to avoid re-renders on cart content changes.
 * Uses SUM(quantity) to stay consistent with useCart's itemCount.
 */
export function useCartCount() {
  const { user } = useAuth();

  const { data: itemCount = 0 } = useQuery({
    queryKey: ['cart-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('user_id', user.id);
      if (error) return 0;
      return (data || []).reduce((sum, row) => sum + (row.quantity || 0), 0);
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30s — lightweight polling-friendly
  });

  return itemCount;
}
