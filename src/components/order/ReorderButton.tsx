import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { OrderItem } from '@/types/database';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface ReorderButtonProps {
  orderItems: OrderItem[];
  sellerId: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function ReorderButton({ 
  orderItems, 
  sellerId, 
  variant = 'default',
  size = 'sm',
  className 
}: ReorderButtonProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const handleReorder = async () => {
    if (!user) {
      toast.error('Please log in to reorder');
      return;
    }

    if (orderItems.length === 0) {
      toast.error('No items to reorder');
      return;
    }

    setIsLoading(true);
    try {
      const productIds = orderItems
        .filter(item => item.product_id)
        .map(item => item.product_id);

      const { data: availableProducts } = await supabase
        .from('products')
        .select('id, price, seller_id')
        .in('id', productIds)
        .eq('is_available', true);

      if (!availableProducts || availableProducts.length === 0) {
        toast.error('None of these items are currently available');
        setIsLoading(false);
        return;
      }

      // Check if user has existing cart items
      const { data: existingCart } = await supabase
        .from('cart_items')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (existingCart && existingCart.length > 0) {
        const confirmReplace = window.confirm(
          'This will replace your current cart items. Continue?'
        );
        if (!confirmReplace) {
          setIsLoading(false);
          return;
        }
      }

      await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', user.id);

      const cartInserts = orderItems
        .filter(item => 
          item.product_id && 
          availableProducts.some(p => p.id === item.product_id)
        )
        .map(item => ({
          user_id: user.id,
          product_id: item.product_id!,
          quantity: item.quantity,
        }));

      if (cartInserts.length === 0) {
        toast.error('None of these items are currently available');
        setIsLoading(false);
        return;
      }

      const { error } = await supabase
        .from('cart_items')
        .insert(cartInserts);

      if (error) throw error;

      const unavailableCount = orderItems.length - cartInserts.length;
      if (unavailableCount > 0) {
        toast.info(`${unavailableCount} item(s) were unavailable and skipped`);
      }

      toast.success('Items added to cart!');
      queryClient.invalidateQueries({ queryKey: ['cart-items'] });
      queryClient.invalidateQueries({ queryKey: ['cart-count'] });
      navigate('/cart');
    } catch (error) {
      console.error('Error reordering:', error);
      toast.error('Failed to reorder. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleReorder}
      disabled={isLoading}
      className={cn(
        'rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-xs',
        className
      )}
    >
      <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
      {size !== 'icon' && (
        <span className="ml-1.5">{isLoading ? 'Adding...' : 'Reorder'}</span>
      )}
    </Button>
  );
}
