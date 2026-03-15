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
  product?: { name: string; image_urls: string[] | null; price: number };
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

      // Enrich with product and seller data
      const suggestions: OrderSuggestion[] = [];
      for (const s of (data || []) as any[]) {
        const { data: product } = await supabase
          .from('products')
          .select('name, image_urls, price')
          .eq('id', s.product_id)
          .single();

        const { data: seller } = await supabase
          .from('seller_profiles')
          .select('business_name')
          .eq('id', s.seller_id)
          .single();

        suggestions.push({
          ...s,
          product: product || undefined,
          seller: seller || undefined,
        });
      }

      return suggestions;
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
