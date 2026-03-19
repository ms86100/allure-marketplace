import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  query: string;
  onSelect: (product: any) => void;
}

interface SellerSuggestion {
  id: string;
  business_name: string;
  description: string | null;
  profile_image_url: string | null;
  categories: string[];
}

export function SearchAutocomplete({ query, onSelect }: Props) {
  const { effectiveSocietyId } = useAuth();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();
  const trimmed = query.trim();

  const { data: productSuggestions = [] } = useQuery({
    queryKey: ['search-autocomplete', trimmed, effectiveSocietyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, price, image_url, seller_id, category, is_veg, description')
        .eq('is_available', true)
        .ilike('name', `%${trimmed}%`)
        .limit(5) as { data: any[] | null };
      return data || [];
    },
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });

  const { data: sellerSuggestions = [] } = useQuery({
    queryKey: ['search-autocomplete-sellers', trimmed],
    queryFn: async (): Promise<SellerSuggestion[]> => {
      const client: any = supabase;
      const { data } = await client
        .from('seller_profiles')
        .select('id, business_name, description, profile_image_url, categories')
        .eq('is_approved', true)
        .ilike('business_name', `%${trimmed}%`)
        .limit(3);
      return (data || []).map((d: any) => ({
        id: d.id,
        business_name: d.business_name,
        description: d.description,
        profile_image_url: d.profile_image_url,
        categories: d.categories || [],
      }));
    },
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });

  if (trimmed.length < 2 || (productSuggestions.length === 0 && sellerSuggestions.length === 0)) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto"
      >
        {/* Seller results */}
        {sellerSuggestions.length > 0 && (
          <div>
            <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
              <Store size={11} className="text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stores</span>
            </div>
            {sellerSuggestions.map((seller) => (
              <button
                key={seller.id}
                onClick={() => navigate(`/seller/${seller.id}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 active:bg-muted transition-colors text-left border-b border-border last:border-0"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 overflow-hidden shrink-0 flex items-center justify-center">
                  {seller.profile_image_url ? (
                    <img src={seller.profile_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Store size={14} className="text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{seller.business_name}</p>
                  {seller.description && (
                    <p className="text-[11px] text-muted-foreground truncate">{seller.description}</p>
                  )}
                </div>
                <span className="text-[10px] font-medium text-primary shrink-0 bg-primary/10 px-2 py-0.5 rounded-full">Visit</span>
              </button>
            ))}
          </div>
        )}

        {/* Product results */}
        {productSuggestions.length > 0 && (
          <div>
            {sellerSuggestions.length > 0 && (
              <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                <Package size={11} className="text-muted-foreground" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Products</span>
              </div>
            )}
            {productSuggestions.map((product) => (
              <button
                key={product.id}
                onClick={() => onSelect({
                  product_id: product.id,
                  product_name: product.name,
                  price: product.price,
                  image_url: product.image_url,
                  is_veg: product.is_veg,
                  category: product.category,
                  description: product.description,
                  seller_id: product.seller_id,
                  seller_name: 'Seller',
                  seller_rating: 0,
                  seller_reviews: 0,
                  society_name: null,
                  distance_km: null,
                  is_same_society: true,
                })}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 active:bg-muted transition-colors text-left border-b border-border last:border-0"
              >
                <div className="w-8 h-8 rounded-lg bg-muted overflow-hidden shrink-0">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm">📦</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{product.name}</p>
                </div>
                <span className="text-[12px] font-bold text-primary shrink-0">{formatPrice(product.price)}</span>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
