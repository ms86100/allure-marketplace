import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  query: string;
  onSelect: (product: any) => void;
}

export function SearchAutocomplete({ query, onSelect }: Props) {
  const { effectiveSocietyId } = useAuth();
  const { formatPrice } = useCurrency();
  const trimmed = query.trim();

  const { data: suggestions = [] } = useQuery({
    queryKey: ['search-autocomplete', trimmed, effectiveSocietyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, price, image_url, seller_id, category, is_veg, description')
        .eq('is_available', true)
        .ilike('name', `%${trimmed}%`)
        .limit(6);
      return data || [];
    },
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });

  if (trimmed.length < 2 || suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden mx-4"
      >
        {suggestions.map((product) => (
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
      </motion.div>
    </AnimatePresence>
  );
}
