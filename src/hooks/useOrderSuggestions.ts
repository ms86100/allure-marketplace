import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface OrderSuggestion {
  id: string;
  user_id: string;
  product_id: string;
  seller_id: string;
  trigger_type: string;
  day_of_week: number;
  time_bucket: number;
  confidence_score: number;
  suggested_at: string;
  dismissed: boolean;
  acted_on: boolean;
  created_at: string;
  product?: { name: string; image_url: string | null; price: number };
  seller?: { business_name: string };
}

export function useOrderSuggestions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['order-suggestions', user?.id],
    queryFn: async () => {
      const today = new Date();
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('order_suggestions')
        .select('*')
        .eq('user_id', user!.id)
        .eq('dismissed', false)
        .eq('acted_on', false)
        .gte('created_at', todayStart.toISOString())
        .order('confidence_score', { ascending: false })
        .limit(3);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Batch fetch products and sellers
      const productIds = [...new Set((data as any[]).map(s => s.product_id).filter(Boolean))];
      const sellerIds = [...new Set((data as any[]).map(s => s.seller_id).filter(Boolean))];

      const [productsRes, sellersRes] = await Promise.all([
        productIds.length > 0
          ? supabase.from('products').select('id, name, image_url, price').in('id', productIds)
          : { data: [] },
        sellerIds.length > 0
          ? supabase.from('seller_profiles').select('id, business_name').in('id', sellerIds)
          : { data: [] },
      ]);

      const productMap = new Map((productsRes.data || []).map((p: any) => [p.id, p]));
      const sellerMap = new Map((sellersRes.data || []).map((s: any) => [s.id, s]));

      return (data as any[]).map(s => ({
        ...s,
        product: productMap.get(s.product_id) || undefined,
        seller: sellerMap.get(s.seller_id) || undefined,
      })) as OrderSuggestion[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('order_suggestions')
        .update({ dismissed: true } as any)
        .eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-suggestions'] });
    },
  });
}

export function useMarkSuggestionActed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('order_suggestions')
        .update({ acted_on: true } as any)
        .eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-suggestions'] });
    },
  });
}
