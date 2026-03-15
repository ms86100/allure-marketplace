import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingBag, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrderSuggestions, useDismissSuggestion, useMarkSuggestionActed } from '@/hooks/useOrderSuggestions';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export function SmartSuggestionBanner() {
  const { data: suggestions, isLoading } = useOrderSuggestions();
  const dismissMutation = useDismissSuggestion();
  const actMutation = useMarkSuggestionActed();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  if (isLoading || !suggestions || suggestions.length === 0) return null;

  const handleReorder = async (suggestion: typeof suggestions[0]) => {
    setReorderingId(suggestion.id);
    try {
      // Find the most recent order with this product from this seller
      const { data: recentOrders } = await supabase
        .from('order_items')
        .select('order_id')
        .eq('product_id', suggestion.product_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentOrders && recentOrders.length > 0) {
        const { data, error } = await supabase.functions.invoke('quick-reorder', {
          body: { order_id: recentOrders[0].order_id },
        });

        if (error || data?.error) {
          // Fall back to navigating to product
          navigate(`/product/${suggestion.product_id}`);
          toast({ title: 'Added to cart', description: 'Review your cart to complete the order.' });
        } else {
          actMutation.mutate(suggestion.id);
          toast({ title: '✅ Order placed!', description: `Your order has been created successfully.` });
          if (data?.orders?.[0]) {
            navigate(`/orders/${data.orders[0]}`);
          }
        }
      } else {
        navigate(`/product/${suggestion.product_id}`);
      }
    } catch {
      navigate(`/product/${suggestion.product_id}`);
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div className="px-4 mt-3 space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles size={14} className="text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested for you</p>
      </div>
      {suggestions.slice(0, 2).map((suggestion, i) => (
        <motion.div
          key={suggestion.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"
        >
          {/* Product image */}
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {suggestion.product?.image_urls?.[0] ? (
              <img src={suggestion.product.image_urls[0]} alt="" className="w-full h-full object-cover" />
            ) : (
              <ShoppingBag size={20} className="text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {suggestion.product?.name || 'Product'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {suggestion.seller?.business_name || 'Seller'}
              {suggestion.product?.price ? ` · ₹${suggestion.product.price}` : ''}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              className="h-8 text-xs px-3"
              onClick={() => handleReorder(suggestion)}
              disabled={reorderingId === suggestion.id}
            >
              {reorderingId === suggestion.id ? '...' : 'Reorder'}
            </Button>
            <button
              onClick={() => dismissMutation.mutate(suggestion.id)}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted"
            >
              <X size={14} className="text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
