import { useMemo } from 'react';
import { ProductWithSeller } from '@/components/product/ProductListingCard';
import { useMarketplaceData, RpcSellerRow } from './useMarketplaceData';

/**
 * Flat, deduplicated product list derived from the shared marketplace data cache.
 * Zero additional network calls.
 */
export function useNearbyProducts() {
  const { data: sellers, isLoading, error } = useMarketplaceData();

  const products = useMemo(() => {
    if (!sellers || sellers.length === 0) return [];
    return flattenSellersToProducts(sellers);
  }, [sellers]);

  return {
    data: products,
    isLoading,
    error,
  };
}

/** Flatten seller rows into a deduplicated product list */
export function flattenSellersToProducts(sellers: RpcSellerRow[]): ProductWithSeller[] {
  const products: ProductWithSeller[] = [];
  const seen = new Set<string>();

  for (const seller of sellers) {
    const items = seller.matching_products;
    if (!Array.isArray(items)) continue;

    for (const p of items) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      products.push(mapProduct(p, seller));
    }
  }
  return products;
}

/** Map a single RPC product + seller into ProductWithSeller */
export function mapProduct(p: any, seller: RpcSellerRow): ProductWithSeller {
  return {
    id: p.id,
    seller_id: seller.seller_id,
    name: p.name,
    price: p.price,
    image_url: p.image_url,
    category: p.category,
    is_veg: p.is_veg ?? true,
    is_available: p.is_available ?? true,
    is_bestseller: p.is_bestseller ?? false,
    is_recommended: p.is_recommended ?? false,
    is_urgent: p.is_urgent ?? false,
    description: null,
    action_type: p.action_type || 'add_to_cart',
    contact_phone: p.contact_phone || null,
    mrp: p.mrp || null,
    discount_percentage: p.discount_percentage || null,
    seller_name: seller.business_name || '',
    seller_rating: seller.rating || 0,
    fulfillment_mode: null,
    delivery_note: null,
    seller_availability_start: seller.availability_start || null,
    seller_availability_end: seller.availability_end || null,
    seller_operating_days: seller.operating_days || null,
    seller_is_available: seller.is_available ?? true,
    distance_km: seller.distance_km ?? null,
    society_name: seller.society_name || null,
    seller_latitude: seller.seller_latitude ?? null,
    seller_longitude: seller.seller_longitude ?? null,
    created_at: '',
    updated_at: '',
  } as ProductWithSeller;
}

/** Utility: merge local products with nearby products, dedup by id */
export function mergeProducts(
  local: ProductWithSeller[],
  nearby: ProductWithSeller[] | undefined,
): ProductWithSeller[] {
  if (!nearby || nearby.length === 0) return local;
  const seen = new Set(local.map((p) => p.id));
  const merged = [...local];
  for (const p of nearby) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  return merged;
}
