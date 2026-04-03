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
}

/**
 * Resolves products for a banner section based on source type.
 * Filters for available, in-stock, approved products.
 * Falls back to popular items if section is empty and fallbackMode = 'popular'.
 */
export async function resolveProducts(options: ResolveOptions): Promise<ResolvedProduct[]> {
  const { sourceType, sourceValue, sectionId, fallbackMode = 'hide', limit = 20 } = options;

  let products: ResolvedProduct[] = [];

  if (sourceType === 'category' && sourceValue) {
    products = await fetchByCategory(sourceValue, limit);
  } else if (sourceType === 'search' && sourceValue) {
    products = await fetchBySearch(sourceValue, limit);
  } else if (sourceType === 'manual' && sectionId) {
    products = await fetchManual(sectionId, limit);
  }

  // Fallback: if no products and fallback mode is 'popular', get bestsellers
  if (products.length === 0 && fallbackMode === 'popular') {
    products = await fetchPopular(limit);
  }

  return products;
}

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
  // Use ilike for simple keyword matching (works without FTS setup on all columns)
  const { data } = await supabase
    .from('products')
    .select('id, name, price, mrp, image_url, category, is_veg, is_available, is_bestseller, stock_quantity, low_stock_threshold, seller_id')
    .eq('is_available', true)
    .eq('approval_status', 'approved')
    .gt('stock_quantity', 0)
    .ilike('name', `%${keyword}%`)
    .order('is_bestseller', { ascending: false })
    .order('price', { ascending: true })
    .limit(limit);

  return (data as ResolvedProduct[]) || [];
}

async function fetchManual(sectionId: string, limit: number): Promise<ResolvedProduct[]> {
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

  return data
    .map((row: any) => row.product as ResolvedProduct)
    .filter((p: ResolvedProduct) => p.is_available && (p.stock_quantity ?? 0) > 0);
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
