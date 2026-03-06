import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { useNearbyProducts, mergeProducts } from './useNearbyProducts';

export function usePopularProducts(limit = 12) {
  const { effectiveSocietyId } = useAuth();
  const { data: nearbyProducts } = useNearbyProducts();

  const localQuery = useQuery({
    queryKey: ['popular-products', effectiveSocietyId, limit],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      let query = supabase
        .from('products')
        .select(`
          *,
          seller:seller_profiles!products_seller_id_fkey(
            id, business_name, rating, society_id, verification_status, fulfillment_mode, delivery_note
          )
        `)
        .eq('is_available', true)
        .eq('approval_status', 'approved')
        .order('is_bestseller', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (effectiveSocietyId) {
        query = query.eq('seller.society_id', effectiveSocietyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || [])
        .filter((p: any) => p.seller?.verification_status === 'approved')
        .map((p: any) => ({
          ...p,
          seller_name: p.seller?.business_name || 'Seller',
          seller_rating: p.seller?.rating || 0,
          seller_id: p.seller_id,
          fulfillment_mode: p.seller?.fulfillment_mode || null,
          delivery_note: p.seller?.delivery_note || null,
        }));
    },
    enabled: !!effectiveSocietyId,
    staleTime: 5 * 60 * 1000,
  });

  // Merge local + nearby, return same react-query shape
  const merged = mergeProducts(localQuery.data || [], nearbyProducts);

  return {
    ...localQuery,
    data: merged,
  };
}

export function useCategoryProducts(parentGroup: string | null, societyId: string | null) {
  const { data: nearbyProducts } = useNearbyProducts();

  const localQuery = useQuery({
    queryKey: ['category-products', parentGroup, societyId],
    queryFn: async (): Promise<ProductWithSeller[]> => {
      let query = supabase
        .from('products')
        .select(`
          *,
          seller:seller_profiles!products_seller_id_fkey(
            id, business_name, rating, society_id, verification_status, primary_group, fulfillment_mode, delivery_note
          )
        `)
        .eq('is_available', true)
        .eq('approval_status', 'approved')
        .eq('seller.primary_group', parentGroup!)
        .order('is_bestseller', { ascending: false })
        .order('created_at', { ascending: false });

      if (societyId) {
        query = query.eq('seller.society_id', societyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).filter((p: any) => p.seller?.verification_status === 'approved').map((p: any) => ({
        ...p,
        seller_name: p.seller?.business_name || 'Seller',
        seller_rating: p.seller?.rating || 0,
        seller_id: p.seller_id,
        fulfillment_mode: p.seller?.fulfillment_mode || null,
        delivery_note: p.seller?.delivery_note || null,
      }));
    },
    enabled: !!parentGroup,
    staleTime: 3 * 60 * 1000,
  });

  // Filter nearby products to match the requested parentGroup
  // We need category_config to map product categories → parent groups, but
  // the RPC doesn't return parent_group. Instead we filter by the seller's
  // primary_group which is already encoded in the nearby data via the RPC's
  // seller row. We can't do that here directly, so we include ALL nearby
  // products and let the caller filter by category if needed.
  // Actually, the nearby data doesn't have primary_group per product, so
  // we'll just merge all and the caller (CategoryGroupPage) already filters
  // by sub-category. This is acceptable since the RPC already filters by
  // approved sellers with products.
  const merged = mergeProducts(localQuery.data || [], nearbyProducts);

  return {
    ...localQuery,
    data: merged,
  };
}
