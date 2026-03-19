import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/hooks/useCart';
import { useHaptics } from '@/hooks/useHaptics';
import { useCurrency } from '@/hooks/useCurrency';
import { RefreshCw, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface BuyAgainProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  seller_id: string;
  seller_name: string;
  order_count: number;
}

export function BuyAgainRow() {
  const { user } = useAuth();
  const { items, addItem } = useCart();
  const { impact } = useHaptics();
  const { formatPrice } = useCurrency();

  const { data: products = [] } = useQuery({
    queryKey: ['buy-again', user?.id],
    queryFn: async (): Promise<BuyAgainProduct[]> => {
      if (!user) return [];

      const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_frequent_products', {
        _user_id: user.id,
        _limit: 12,
      });

      if (!rpcError && rpcData && rpcData.length > 0) {
        return rpcData.map((r: any) => ({
          id: r.product_id,
          name: r.product_name,
          price: r.price,
          image_url: r.image_url,
          seller_id: r.seller_id || '',
          seller_name: r.seller_name || '',
          order_count: Number(r.order_count) || 0,
        }));
      }

      if (rpcError) console.warn('[BuyAgain] RPC error, using fallback:', rpcError.message);

      const { data, error } = await supabase
        .from('order_items')
        .select(`
          product_id, quantity,
          product:products!inner(id, name, price, image_url, is_available, seller_id,
            seller:seller_profiles!products_seller_id_fkey(business_name)
          ),
          order:orders!inner(buyer_id, status)
        `)
        .eq('order.buyer_id', user.id)
        .eq('order.status', 'completed')
        .eq('product.is_available', true)
        .limit(100);

      if (error || !data) return [];

      const freq: Record<string, BuyAgainProduct & { count: number }> = {};
      for (const item of data) {
        const p = (item as any).product;
        if (!p) continue;
        const pid = p.id;
        if (!freq[pid]) {
          freq[pid] = {
            id: pid,
            name: p.name,
            price: p.price,
            image_url: p.image_url,
            seller_id: p.seller_id || '',
            seller_name: p.seller?.business_name || '',
            order_count: 0,
            count: 0,
          };
        }
        freq[pid].count += 1;
        freq[pid].order_count = freq[pid].count;
      }

      return Object.values(freq)
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  if (products.length === 0) return null;

  const isInCart = (productId: string) => items.some(i => i.product_id === productId);

  const handleQuickAdd = async (product: BuyAgainProduct) => {
    if (isInCart(product.id)) return;
    if (!product.seller_id) {
      console.error('[BuyAgain] Missing seller_id for product:', product.id);
      toast.error('Cannot add this item — missing seller info');
      return;
    }
    // addItem already handles haptic feedback via feedbackEngine
    await addItem({
      id: product.id,
      seller_id: product.seller_id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      category: '' as any,
      is_veg: true,
      is_available: true,
      is_bestseller: false,
      is_recommended: false,
      is_urgent: false,
      description: null,
      created_at: '',
      updated_at: '',
    });
  };

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 px-4 mb-3">
        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <RefreshCw size={12} className="text-primary" />
        </div>
        <h3 className="font-bold text-[14px] text-foreground tracking-tight">Buy Again</h3>
      </div>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 pb-2">
        {products.map((product, i) => {
          const inCart = isInCart(product.id);
          return (
            <motion.button
              key={product.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => handleQuickAdd(product)}
              className={cn(
                'shrink-0 w-[105px] rounded-2xl border bg-card overflow-hidden text-left transition-all duration-200',
                inCart ? 'border-primary/40 shadow-sm' : 'border-border active:scale-[0.96] hover:shadow-md hover:border-primary/20'
              )}
            >
              <div className="aspect-square bg-muted relative overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-contain p-2"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🛒</div>
                )}
                <div className={cn(
                  'absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all',
                  inCart ? 'bg-primary scale-110' : 'bg-primary hover:scale-110'
                )}>
                  {inCart ? (
                    <Check size={12} className="text-primary-foreground" />
                  ) : (
                    <Plus size={12} className="text-primary-foreground" />
                  )}
                </div>
                {product.order_count > 1 && (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-foreground/80 text-background text-[8px] font-bold">
                    {product.order_count}× ordered
                  </div>
                )}
              </div>
              <div className="px-2 py-2">
                <p className="text-[11px] font-semibold text-foreground line-clamp-2 leading-tight">
                  {product.name}
                </p>
                <p className="text-[11px] font-bold text-primary mt-1">{formatPrice(product.price)}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
