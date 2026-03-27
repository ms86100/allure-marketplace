import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';
import { useAuth } from '@/contexts/AuthContext';
import { jitteredStaleTime } from '@/lib/query-utils';

/**
 * Raw seller row from search_sellers_by_location RPC.
 * Single source of truth — called ONCE, consumed by all marketplace hooks.
 */
export interface RpcSellerRow {
  seller_id: string;
  user_id: string;
  business_name: string;
  description: string | null;
  categories: string[] | null;
  primary_group: string | null;
  cover_image_url: string | null;
  profile_image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  rating: number;
  total_reviews: number;
  matching_products: any[];
  distance_km: number;
  society_name: string | null;
  availability_start: string | null;
  availability_end: string | null;
  seller_latitude: number | null;
  seller_longitude: number | null;
  operating_days: string[] | null;
}

/**
 * Single RPC call for ALL marketplace data. Every other hook
 * (useProductsByCategory, useNearbyProducts, useStoreDiscovery,
 *  usePopularProducts, useTrendingProducts) derives from this cache.
 *
 * No society exclusion at RPC level — consumers filter client-side if needed.
 * This eliminates the former useMarketplaceDataFull duplicate.
 */
export function useMarketplaceData() {
  const { browsingLocation } = useBrowsingLocation();
  const { profile } = useAuth();

  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;
  const radiusKm = profile?.search_radius_km ?? MARKETPLACE_RADIUS_KM;

  return useQuery({
    queryKey: ['marketplace-data', lat, lng, radiusKm],
    queryFn: async (): Promise<RpcSellerRow[]> => {
      if (!lat || !lng) return [];

      const { data, error } = await supabase.rpc('search_sellers_by_location' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: radiusKm,
      });

      if (error) {
        console.error('Marketplace data RPC error:', error);
        return [];
      }

      return (data || []) as RpcSellerRow[];
    },
    enabled: !!(lat && lng),
    staleTime: jitteredStaleTime(10 * 60 * 1000),
  });
}
