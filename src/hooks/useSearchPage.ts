import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { useCart } from '@/hooks/useCart';
import { FilterState, defaultFilters } from '@/components/search/SearchFilters';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useMarketplaceConfig } from '@/hooks/useMarketplaceConfig';
import { useBadgeConfig } from '@/hooks/useBadgeConfig';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useQuery } from '@tanstack/react-query';
import { jitteredStaleTime } from '@/lib/query-utils';
import { useCurrency } from '@/hooks/useCurrency';
import { MARKETPLACE_RADIUS_KM } from '@/lib/marketplace-constants';

export interface ProductSearchResult {
  product_id: string;
  product_name: string;
  price: number;
  image_url: string | null;
  is_veg: boolean | null;
  category: string | null;
  description?: string | null;
  prep_time_minutes?: number | null;
  fulfillment_mode?: string | null;
  delivery_note?: string | null;
  action_type?: string | null;
  contact_phone?: string | null;
  mrp?: number | null;
  discount_percentage?: number | null;
  seller_id: string;
  seller_name: string;
  seller_rating: number;
  seller_reviews: number;
  society_name: string | null;
  distance_km: number | null;
  is_same_society: boolean;
}

const FILTER_STORAGE_KEY_BASE = 'app_search_filters';
const getFilterStorageKey = (userId?: string) => userId ? `${FILTER_STORAGE_KEY_BASE}_${userId}` : FILTER_STORAGE_KEY_BASE;

const loadSavedFilters = (userId?: string): FilterState => {
  try {
    const saved = localStorage.getItem(getFilterStorageKey(userId));
    if (saved) return { ...defaultFilters, ...JSON.parse(saved) };
  } catch { localStorage.removeItem(getFilterStorageKey(userId)); }
  return defaultFilters;
};

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState<T>(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

/** Map a seller row from search_sellers_by_location RPC into ProductSearchResult[] */
function mapSellerRpcProducts(seller: any): ProductSearchResult[] {
  const products: ProductSearchResult[] = [];
  (seller.matching_products || []).forEach((p: any) => {
    products.push({
      product_id: p.id, product_name: p.name, price: p.price, image_url: p.image_url,
      is_veg: p.is_veg, category: p.category, description: null, prep_time_minutes: null,
      fulfillment_mode: null, delivery_note: null, action_type: p.action_type || 'add_to_cart',
      contact_phone: p.contact_phone || null, mrp: p.mrp || null, discount_percentage: p.discount_percentage || null,
      seller_id: seller.seller_id, seller_name: seller.business_name || '', seller_rating: seller.rating || 0,
      seller_reviews: seller.total_reviews || 0, society_name: seller.society_name || null,
      distance_km: seller.distance_km || null, is_same_society: (seller.distance_km ?? 99) < 0.5,
    });
  });
  return products;
}

export function useSearchPage() {
  const { user, effectiveSocietyId, profile } = useAuth();
  const { browsingLocation } = useBrowsingLocation();
  const navigate = useNavigate();
  const { items: cartItems, addItem, updateQuantity } = useCart();
  const [searchParams] = useSearchParams();
  const { configs: categoryConfigs, isLoading: categoriesLoading } = useCategoryConfigs();
  const mc = useMarketplaceConfig();
  const { badges: badgeConfigs } = useBadgeConfig();
  const settings = useSystemSettings();
  const { formatPrice, currencySymbol } = useCurrency();

  const lat = browsingLocation?.lat;
  const lng = browsingLocation?.lng;
  const hasCoords = !!(lat && lng);

  const categoryMap = useMemo(() => {
    const m: Record<string, { icon: string; displayName: string; color: string; supportsCart?: boolean; enquiryOnly?: boolean; requiresTimeSlot?: boolean }> = {};
    categoryConfigs.forEach((c) => {
      m[c.category] = { icon: c.icon, displayName: c.displayName, color: c.color, supportsCart: c.behavior?.supportsCart ?? false, enquiryOnly: c.behavior?.enquiryOnly ?? false, requiresTimeSlot: c.behavior?.requiresTimeSlot ?? false };
    });
    return m;
  }, [categoryConfigs]);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [filters, setFilters] = useState<FilterState>(() => loadSavedFilters(user?.id));
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [browseBeyond, setBrowseBeyondLocal] = useState(profile?.browse_beyond_community ?? true);
  const [searchRadius, setSearchRadiusLocal] = useState(profile?.search_radius_km ?? MARKETPLACE_RADIUS_KM);

  useEffect(() => { if (profile) { setBrowseBeyondLocal(profile.browse_beyond_community ?? true); setSearchRadiusLocal(profile.search_radius_km ?? MARKETPLACE_RADIUS_KM); } }, [profile]);

  const persistPreference = useCallback(async (field: string, value: any) => { if (!user) return; await supabase.from('profiles').update({ [field]: value } as any).eq('id', user.id); }, [user]);
  const setBrowseBeyond = useCallback((val: boolean) => { setBrowseBeyondLocal(val); persistPreference('browse_beyond_community', val); }, [persistPreference]);
  const setSearchRadius = useCallback((val: number) => { setSearchRadiusLocal(val); persistPreference('search_radius_km', val); }, [persistPreference]);

  // Popular products — coordinate-based via search_sellers_by_location RPC
  const { data: popularProducts = [], isLoading: isLoadingPopular } = useQuery({
    queryKey: ['search-popular-products', lat, lng, browseBeyond, searchRadius],
    queryFn: async (): Promise<ProductSearchResult[]> => {
      const radius = browseBeyond ? searchRadius : 2;
      const { data, error } = await supabase.rpc('search_sellers_by_location', {
        _lat: lat!, _lng: lng!, _radius_km: radius,
      });
      if (error || !data) return [];
      const mapped: ProductSearchResult[] = [];
      (data as any[]).forEach((seller) => {
        mapSellerRpcProducts(seller).forEach((p) => {
          if (!mapped.some(x => x.product_id === p.product_id)) mapped.push(p);
        });
      });
      return mapped;
    },
    enabled: hasCoords,
    staleTime: jitteredStaleTime(3 * 60 * 1000),
  });

  useEffect(() => { const sort = searchParams.get('sort'); if (sort === 'rating') handlePresetSelect('top_rated', { minRating: 4, sortBy: 'rating' }); }, []);

  const hasActiveFilters = () => filters.minRating > 0 || filters.isVeg !== null || filters.categories.length > 0 || filters.sortBy !== null || filters.priceRange[0] > 0 || filters.priceRange[1] < settings.maxPriceFilter;
  const isSearchActive = debouncedQuery.length >= 2 || hasActiveFilters() || selectedCategory !== null;
  const filtersKey = JSON.stringify(filters);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isSearchActive) { runSearch(debouncedQuery); localStorage.setItem(getFilterStorageKey(user?.id), JSON.stringify(filters)); }
    else { setResults([]); setHasSearched(false); }
  }, [debouncedQuery, filtersKey, browseBeyond, searchRadius, selectedCategory]);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const runSearch = async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true); setHasSearched(true);

    // Log search demand (best-effort, still society-scoped)
    if (term.length >= 3 && effectiveSocietyId) {
      supabase.from('search_demand_log').insert({ society_id: effectiveSocietyId, search_term: term.trim().toLowerCase(), category: selectedCategory || null }).then(() => {});
    }

    try {
      let products: ProductSearchResult[] = [];
      const effectiveCategories = selectedCategory ? [selectedCategory, ...filters.categories.filter(c => c !== selectedCategory)] : filters.categories;
      const radius = browseBeyond ? searchRadius : 2;

      if (term.length >= 2 && hasCoords) {
        // Primary: coordinate-based RPC search
        const rpcPromise = supabase.rpc('search_sellers_by_location', {
          _lat: lat!, _lng: lng!, _radius_km: radius,
          _search_term: term.trim(),
          _category: selectedCategory || (effectiveCategories.length === 1 ? effectiveCategories[0] : null),
        });

        const { data: rpcData, error: rpcError } = await rpcPromise;

        if (!rpcError && rpcData) {
          const existingIds = new Set<string>();
          (rpcData as any[]).forEach((seller) => {
            mapSellerRpcProducts(seller).forEach((p) => {
              if (!existingIds.has(p.product_id)) {
                existingIds.add(p.product_id);
                products.push(p);
              }
            });
          });
        }
      } else if ((selectedCategory || effectiveCategories.length > 0) && hasCoords) {
        // Category-only filter (no search term) — use RPC with category filter
        const targetCategory = selectedCategory || effectiveCategories[0];
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_sellers_by_location', {
          _lat: lat!, _lng: lng!, _radius_km: radius,
          _category: targetCategory || null,
        });

        if (!rpcError && rpcData) {
          (rpcData as any[]).forEach((seller) => {
            mapSellerRpcProducts(seller).forEach((p) => products.push(p));
          });
        }
      }

      // Apply client-side filters
      let filtered = products;
      if (filters.minRating > 0) filtered = filtered.filter((p) => p.seller_rating >= filters.minRating);
      if (filters.isVeg === true) filtered = filtered.filter((p) => p.is_veg === true);
      if (filters.isVeg === false) filtered = filtered.filter((p) => p.is_veg === false);
      if (effectiveCategories.length > 0 && term.length >= 2) filtered = filtered.filter((p) => p.category && effectiveCategories.includes(p.category as any));
      if (filters.priceRange[0] > 0 || filters.priceRange[1] < settings.maxPriceFilter) filtered = filtered.filter((p) => p.price >= filters.priceRange[0] && p.price <= filters.priceRange[1]);

      if (filters.sortBy === 'price_low') filtered.sort((a, b) => a.price - b.price);
      else if (filters.sortBy === 'price_high') filtered.sort((a, b) => b.price - a.price);
      else if (filters.sortBy === 'rating') filtered.sort((a, b) => b.seller_rating - a.seller_rating);
      else filtered.sort((a, b) => { if (a.is_same_society !== b.is_same_society) return a.is_same_society ? -1 : 1; return (a.distance_km ?? 0) - (b.distance_km ?? 0); });

      if (!controller.signal.aborted) setResults(filtered);
    } catch (err) { if (!controller.signal.aborted) console.error('Search error:', err); }
    finally { if (!controller.signal.aborted) setIsLoading(false); }
  };

  const clearFilters = () => { setQuery(''); setFilters(defaultFilters); setActivePreset(null); setSelectedCategory(null); setResults([]); setHasSearched(false); localStorage.removeItem(getFilterStorageKey(user?.id)); };
  const handleFiltersChange = (f: FilterState) => { setFilters(f); setActivePreset(null); };
  const handlePresetSelect = (id: string | null, pf: Partial<FilterState>) => { setActivePreset(id); setFilters(id ? { ...defaultFilters, ...pf } : defaultFilters); };
  const handleCategoryTap = (cat: string) => { setSelectedCategory(prev => prev === cat ? null : cat); };

  const pills: string[] = [];
  if (query) pills.push(`"${query}"`);
  if (selectedCategory) pills.push(categoryMap[selectedCategory]?.displayName || selectedCategory);
  if (filters.minRating > 0) pills.push(`${filters.minRating}+★`);
  if (filters.isVeg === true) pills.push('Veg');
  if (filters.isVeg === false) pills.push('Non-veg');
  if (filters.categories.length) pills.push(...filters.categories.map((c) => categoryMap[c]?.displayName || c));
  if (filters.sortBy) { const labels: Record<string, string> = { rating: 'Top Rated', newest: 'Newest', price_low: `${currencySymbol} Low→High`, price_high: `${currencySymbol} High→Low` }; pills.push(labels[filters.sortBy]); }

  const displayProducts = isSearchActive ? results : popularProducts;
  const showLoading = isSearchActive ? isLoading : isLoadingPopular;

  return {
    navigate, query, setQuery, filters, setFilters,
    activePreset, selectedCategory, isSearchActive,
    browseBeyond, setBrowseBeyond, setBrowseBeyondLocal,
    searchRadius, setSearchRadius, setSearchRadiusLocal,
    categoryConfigs, categoriesLoading, categoryMap,
    mc, badgeConfigs, settings, formatPrice, currencySymbol,
    popularProducts, isLoadingPopular,
    displayProducts, showLoading, hasSearched,
    pills, clearFilters, handleFiltersChange, handlePresetSelect, handleCategoryTap,
  };
}
