// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';

export interface ResolvedProduct {
  id: string;
  name: string;
  price: number;
  mrp: number | null;
  image_url: string | null;
  category: string | null;
  is_veg: boolean | null;
  is_available: boolean;
  is_bestseller: boolean;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  seller_id: string;
}

interface ResolveOptions {
  sourceType: 'category' | 'search' | 'manual';
  sourceValue: string | null;
  sectionId?: string;
  fallbackMode?: 'hide' | 'popular';
  limit?: number;
  /** Society-aware filtering */
  societyId?: string;
  buyerLat?: number;
  buyerLng?: number;
  /** Banner ID for seller participation enforcement */
  bannerId?: string;
}

/**
 * Resolves products for a banner section based on source type.
 * When societyId is provided, uses the server-side RPC that enforces
 * seller eligibility, society membership, and delivery radius constraints.
 * Falls back to direct queries when no society context is available.
 */
export async function resolveProducts(options: ResolveOptions): Promise<ResolvedProduct[]> {
  const {
    sourceType, sourceValue, sectionId,
    fallbackMode = 'hide', limit = 20,
    societyId, buyerLat, buyerLng, bannerId,
  } = options;

  let products: ResolvedProduct[] = [];

  if (sourceType === 'manual' && sectionId) {
    // Manual mode: fetch join table then validate via RPC
    products = await fetchManual(sectionId, limit, societyId, buyerLat, buyerLng, bannerId);
  } else if (societyId) {
    // Society-aware path: use the resolve_banner_products RPC
    products = await fetchViaRpc(sourceType, sourceValue, societyId, buyerLat, buyerLng, limit, bannerId);
  } else {
    // Legacy global path (no society context)
    if (sourceType === 'category' && sourceValue) {
      products = await fetchByCategory(sourceValue, limit);
    } else if (sourceType === 'search' && sourceValue) {
      products = await fetchBySearch(sourceValue, limit);
    }
  }

  // Fallback: if no products and fallback mode is 'popular', get bestsellers
  if (products.length === 0 && fallbackMode === 'popular') {
    if (societyId) {
      products = await fetchViaRpc('popular', null, societyId, buyerLat, buyerLng, limit, bannerId);
    } else {
      products = await fetchPopular(limit);
    }
  }

  return products;
}

/** Society-aware resolution via server-side RPC */
async function fetchViaRpc(
  mode: string,
  value: string | null,
  societyId: string,
  buyerLat?: number,
  buyerLng?: number,
  limit: number = 20,
  bannerId?: string,
): Promise<ResolvedProduct[]> {
  const { data } = await supabase.rpc('resolve_banner_products', {
    p_mode: mode,
    p_value: value || '',
    p_society_id: societyId,
    p_buyer_lat: buyerLat ?? null,
    p_buyer_lng: buyerLng ?? null,
    p_limit: limit,
    p_banner_id: bannerId ?? null,
  });

  return (data as ResolvedProduct[]) || [];
}

/** Manual section: fetch product IDs from join table, then validate eligibility */
async function fetchManual(
  sectionId: string,
  limit: number,
  societyId?: string,
  buyerLat?: number,
  buyerLng?: number,
  bannerId?: string,
): Promise<ResolvedProduct[]> {
  const { data } = await supabase
    .from('banner_section_products')
    .select(`
      display_order,
      product:products!inner(id, name, price, mrp, image_url, category, is_veg, is_available, is_bestseller, stock_quantity, low_stock_threshold, seller_id)
    `)
    .eq('section_id', sectionId)
    .order('display_order', { ascending: true })
    .limit(limit);

  if (!data) return [];

  let products = data
    .map((row: any) => row.product as ResolvedProduct)
    .filter((p: ResolvedProduct) => p.is_available && (p.stock_quantity ?? 0) > 0);

  // If society context, further validate seller eligibility via RPC
  // by fetching eligible products and intersecting
  if (societyId && products.length > 0) {
    const eligibleIds = new Set<string>();
    const { data: eligible } = await supabase.rpc('resolve_banner_products', {
      p_mode: 'popular',
      p_value: '',
      p_society_id: societyId,
      p_buyer_lat: buyerLat ?? null,
      p_buyer_lng: buyerLng ?? null,
      p_limit: 1000,
    });
    if (eligible) {
      for (const p of eligible as any[]) {
        eligibleIds.add(p.id);
      }
    }
    products = products.filter(p => eligibleIds.has(p.id));
  }

  return products;
}

// ── Legacy fallback functions (used when no society context) ──

async function fetchByCategory(category: string, limit: number): Promise<ResolvedProduct[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, price, mrp, image_url, category, is_veg, is_available, is_bestseller, stock_quantity, low_stock_threshold, seller_id')
    .eq('category', category)
    .eq('is_available', true)
    .eq('approval_status', 'approved')
    .gt('stock_quantity', 0)
    .order('is_bestseller', { ascending: false })
    .order('is_recommended', { ascending: false })
    .order('price', { ascending: true })
    .limit(limit);

  return (data as ResolvedProduct[]) || [];
}

async function fetchBySearch(keyword: string, limit: number): Promise<ResolvedProduct[]> {
  // Over-fetch 3x to compensate for client-side filtering
  const { data } = await supabase.rpc('search_products_fts', {
    _query: keyword,
    _limit: limit * 3,
  });

  if (!data) return [];

  return (data as any[])
    .filter((p: any) => p.is_available && p.approval_status === 'approved' && (p.stock_quantity ?? 0) > 0)
    .slice(0, limit)
    .map((p: any): ResolvedProduct => ({
      id: p.id,
      name: p.name,
      price: p.price,
      mrp: p.mrp,
      image_url: p.image_url,
      category: p.category,
      is_veg: p.is_veg,
      is_available: p.is_available,
      is_bestseller: p.is_bestseller,
      stock_quantity: p.stock_quantity,
      low_stock_threshold: p.low_stock_threshold,
      seller_id: p.seller_id,
    }));
}

async function fetchPopular(limit: number): Promise<ResolvedProduct[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, price, mrp, image_url, category, is_veg, is_available, is_bestseller, stock_quantity, low_stock_threshold, seller_id')
    .eq('is_available', true)
    .eq('approval_status', 'approved')
    .gt('stock_quantity', 0)
    .eq('is_bestseller', true)
    .order('price', { ascending: true })
    .limit(limit);

  return (data as ResolvedProduct[]) || [];
}
