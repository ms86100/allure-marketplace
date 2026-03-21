import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { jitteredStaleTime } from '@/lib/query-utils';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';
import { useAuth } from '@/contexts/AuthContext';

export interface TopProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  is_veg: boolean | null;
  mrp: number | null;
  discount_percentage: number | null;
}

export interface LocalSeller {
  id: string;
  business_name: string;
  profile_image_url: string | null;
  cover_image_url: string | null;
  description: string | null;
  rating: number;
  total_reviews: number;
  primary_group: string | null;
  categories: string[] | null;
  is_featured: boolean;
  topProducts: TopProduct[];
}

export interface NearbySeller {
  seller_id: string;
  business_name: string;
  profile_image_url: string | null;
  cover_image_url: string | null;
  description: string | null;
  rating: number;
  total_reviews: number;
  primary_group: string | null;
  categories: string[] | null;
  society_name: string;
  distance_km: number;
  is_featured: boolean;
  topProducts: TopProduct[];
}

export interface DistanceBand {
  label: string;
  minKm: number;
  maxKm: number;
  societies: SocietyGroup[];
}

export interface SocietyGroup {
  societyName: string;
  distanceKm: number;
  sellersByGroup: Record<string, NearbySeller[]>;
}

/** Parse matching_products JSON from RPC, return top 3 by lowest price */
function parseTopProducts(raw: any): TopProduct[] {
  if (!raw || !Array.isArray(raw)) return [];
  const products: TopProduct[] = raw
    .filter((p: any) => p && p.name && typeof p.price === 'number')
    .map((p: any) => ({
      id: p.id || '',
      name: p.name,
      price: p.price,
      image_url: p.image_url || null,
      category: p.category || null,
      is_veg: p.is_veg ?? null,
      mrp: p.mrp ?? null,
      discount_percentage: p.discount_percentage ?? null,
    }));
  // Sort by price ascending, take top 3
  products.sort((a, b) => a.price - b.price);
  return products.slice(0, 3);
}

/**
 * Coordinate-based "local" sellers within ~2 km of browsingLocation.
 */
export function useLocalSellers() {
  const { browsingLocation } = useBrowsingLocation();
  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;

  return useQuery({
    queryKey: ['store-discovery', 'local', lat, lng],
    queryFn: async () => {
      if (!lat || !lng) return {};

      const { data, error } = await supabase.rpc('search_sellers_by_location' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: MARKETPLACE_RADIUS_KM,
      });

      if (error) {
        console.error('Local sellers error:', error);
        return {};
      }

      const grouped: Record<string, LocalSeller[]> = {};
      for (const seller of (data || []) as any[]) {
        const group = seller.primary_group || 'Other';
        if (!grouped[group]) grouped[group] = [];
        grouped[group].push({
          id: seller.seller_id,
          business_name: seller.business_name,
          profile_image_url: seller.profile_image_url,
          cover_image_url: seller.cover_image_url || null,
          description: seller.description || null,
          rating: seller.rating || 0,
          total_reviews: seller.total_reviews || 0,
          primary_group: seller.primary_group,
          categories: seller.categories,
          is_featured: seller.is_featured || false,
          topProducts: parseTopProducts(seller.matching_products),
        });
      }
      return grouped;
    },
    enabled: !!(lat && lng),
    staleTime: jitteredStaleTime(10 * 60_000),
  });
}

/**
 * Coordinate-based nearby sellers grouped by distance band.
 */
export function useNearbySocietySellers(radiusKm: number = MARKETPLACE_RADIUS_KM, enabled: boolean = true) {
  const { browsingLocation } = useBrowsingLocation();
  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;

  return useQuery({
    queryKey: ['store-discovery', 'nearby', lat, lng, radiusKm],
    queryFn: async () => {
      if (!lat || !lng) return [];

      const { data, error } = await supabase.rpc('search_sellers_by_location' as any, {
        _lat: lat,
        _lng: lng,
        _radius_km: radiusKm,
      });

      if (error) {
        console.error('Nearby sellers error:', error);
        return [];
      }

      const sellers: NearbySeller[] = ((data as any[]) || []).map((s: any) => ({
        seller_id: s.seller_id,
        business_name: s.business_name,
        profile_image_url: s.profile_image_url,
        cover_image_url: s.cover_image_url || null,
        description: s.description || null,
        rating: s.rating || 0,
        total_reviews: s.total_reviews || 0,
        primary_group: s.primary_group,
        categories: s.categories,
        society_name: s.society_name,
        distance_km: s.distance_km,
        is_featured: s.is_featured || false,
        topProducts: parseTopProducts(s.matching_products),
      }));

      const ALL_BANDS: { label: string; minKm: number; maxKm: number }[] = [
        { label: 'Within 2 km', minKm: 0, maxKm: 2 },
        { label: 'Within 5 km', minKm: 2, maxKm: 5 },
        { label: 'Within 10 km', minKm: 5, maxKm: 10 },
      ];
      const BANDS = ALL_BANDS.filter(b => b.minKm < radiusKm);

      const bands: DistanceBand[] = BANDS.map(band => {
        const bandSellers = sellers.filter(
          s => s.distance_km >= band.minKm && s.distance_km < band.maxKm
        );

        const societyMap: Record<string, { distanceKm: number; sellers: NearbySeller[] }> = {};
        for (const s of bandSellers) {
          const key = s.society_name || (s.distance_km <= 2 ? 'Near Your Society' : 'Independent Stores');
          if (!societyMap[key]) {
            societyMap[key] = { distanceKm: s.distance_km, sellers: [] };
          }
          societyMap[key].sellers.push(s);
        }

        const societies: SocietyGroup[] = Object.entries(societyMap).map(([name, info]) => {
          const sellersByGroup: Record<string, NearbySeller[]> = {};
          for (const seller of info.sellers) {
            const group = seller.primary_group || 'Other';
            if (!sellersByGroup[group]) sellersByGroup[group] = [];
            sellersByGroup[group].push(seller);
          }
          return { societyName: name, distanceKm: info.distanceKm, sellersByGroup };
        });

        return { ...band, societies };
      }).filter(band => band.societies.length > 0);

      return bands;
    },
    enabled: !!(lat && lng) && enabled,
    staleTime: jitteredStaleTime(10 * 60_000),
  });
}
