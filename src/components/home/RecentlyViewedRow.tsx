import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/useCurrency';
import { Eye, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export function RecentlyViewedRow() {
  const { recentIds } = useRecentlyViewed();
  const { items, addItem } = useCart();
  const { formatPrice } = useCurrency();

  const { data: products = [] } = useQuery({
    queryKey: ['recently-viewed-products', recentIds],
    queryFn: async () => {
      if (recentIds.length === 0) return [];
      const { data } = await supabase
        .from('products')
        .select('id, name, price, image_url, seller_id, is_available, is_veg, category, is_bestseller, is_recommended, is_urgent, description, created_at, updated_at')
        .in('id', recentIds)
        .eq('is_available', true);
      if (!data) return [];
      // Preserve recency order
      return recentIds
        .map(id => data.find(p => p.id === id))
        .filter(Boolean) as typeof data;
    },
    enabled: recentIds.length > 0,
    staleTime: 2 * 60_000,
  });

  if (products.length === 0) return null;

  const isInCart = (id: string) => items.some(i => i.product_id === id);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 px-4 mb-3">
        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <Eye size={12} className="text-primary" />
        </div>
        <h3 className="font-bold text-[14px] text-foreground tracking-tight">Recently Viewed</h3>
      </div>
      {/* Gap #9: Denser cards — 90px wide, aspect-[4/3] images */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-2">
        {products.map((product, i) => {
          const inCart = isInCart(product.id);
          return (
            <motion.button
              key={product.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => !inCart && addItem(product as any)}
              className={cn(
                'shrink-0 w-[90px] rounded-2xl border bg-card overflow-hidden text-left transition-all duration-200',
                inCart ? 'border-primary/40 shadow-sm' : 'border-border active:scale-[0.96] hover:shadow-md hover:border-primary/20'
              )}
            >
              <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1.5" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                )}
                <div className={cn(
                  'absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-md transition-all',
                  inCart ? 'bg-primary scale-110' : 'bg-primary hover:scale-110'
                )}>
                  {inCart ? <Check size={10} className="text-primary-foreground" /> : <Plus size={10} className="text-primary-foreground" />}
                </div>
              </div>
              <div className="px-1.5 py-1.5">
                <p className="text-[10px] font-semibold text-foreground line-clamp-2 leading-tight">{product.name}</p>
                <p className="text-[10px] font-bold text-primary mt-0.5">{formatPrice(product.price)}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
