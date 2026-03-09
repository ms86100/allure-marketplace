import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { jitteredStaleTime } from '@/lib/query-utils';

/**
 * Fetches trending products in the user's society based on recent order velocity.
 * Uses server-side RPC for efficient computation.
 */
export function useTrendingProducts(limit = 10) {
  const { effectiveSocietyId } = useAuth();

  return useQuery({
    queryKey: ['trending-products', effectiveSocietyId, limit],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      const { data, error } = await supabase.rpc('get_trending_products_by_society', {
        _society_id: effectiveSocietyId!,
        _limit: limit,
      });

      if (error) {
        console.warn('[TrendingProducts] RPC error, falling back to client query:', error.message);
        return fallbackClientQuery(effectiveSocietyId!, limit);
      }

      if (!data || data.length === 0) return [];

      return data.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        image_url: p.image_url,
        category: p.category,
        is_veg: p.is_veg,
        is_available: p.is_available,
        is_bestseller: p.is_bestseller,
        is_recommended: p.is_recommended,
        is_urgent: p.is_urgent,
        seller_id: p.seller_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        seller_name: p.seller_business_name || 'Seller',
        seller_rating: p.seller_rating || 0,
        completed_order_count: p.seller_completed_order_count || 0,
        last_active_at: p.seller_last_active_at || null,
        fulfillment_mode: p.seller_fulfillment_mode || null,
        delivery_note: p.seller_delivery_note || null,
        seller_availability_start: p.seller_availability_start || null,
        seller_availability_end: p.seller_availability_end || null,
        seller_operating_days: p.seller_operating_days || null,
        seller_is_available: p.seller_is_available ?? true,
        _orderCount: p.order_count || 0,
      }));
    },
    enabled: !!effectiveSocietyId,
    staleTime: jitteredStaleTime(5 * 60 * 1000),
  });
}

/** Fallback if RPC not yet available */
async function fallbackClientQuery(societyId: string, limit: number): Promise<ProductWithSeller[]> {
  const { data: orderData } = await supabase
    .from('order_items')
    .select(`product_id, order:orders!inner(society_id, created_at, status)`)
    .eq('order.society_id', societyId)
    .neq('order.status', 'cancelled')
    .gte('order.created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(200);

  if (!orderData?.length) return [];

  const productCounts = new Map<string, number>();
  for (const item of orderData) {
    const pid = item.product_id;
    if (pid) productCounts.set(pid, (productCounts.get(pid) || 0) + 1);
  }

  const topProductIds = [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topProductIds.length === 0) return [];

  const { data: products } = await supabase
    .from('products')
    .select(`*, seller:seller_profiles!products_seller_id_fkey(
      id, business_name, rating, society_id, verification_status,
      fulfillment_mode, delivery_note, availability_start, availability_end,
      operating_days, is_available, completed_order_count, last_active_at
    )`)
    .in('id', topProductIds)
    .eq('is_available', true)
    .eq('approval_status', 'approved');

  if (!products) return [];

  return products
    .filter((p: any) => p.seller?.verification_status === 'approved')
    .map((p: any) => ({
      ...p,
      seller_name: p.seller?.business_name || 'Seller',
      seller_rating: p.seller?.rating || 0,
      completed_order_count: p.seller?.completed_order_count || 0,
      last_active_at: p.seller?.last_active_at || null,
      fulfillment_mode: p.seller?.fulfillment_mode || null,
      delivery_note: p.seller?.delivery_note || null,
      seller_availability_start: p.seller?.availability_start || null,
      seller_availability_end: p.seller?.availability_end || null,
      seller_operating_days: p.seller?.operating_days || null,
      seller_is_available: p.seller?.is_available ?? true,
      _orderCount: productCounts.get(p.id) || 0,
    }))
    .sort((a: any, b: any) => (b._orderCount || 0) - (a._orderCount || 0));
}
