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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
  const [showConfirm, setShowConfirm] = useState(false);
  const handleReorder = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!user) {
      toast.error('Please log in to reorder');
      return;
    }

    if (orderItems.length === 0) {
      toast.error('No items to reorder');
      return;
    }

    // Check for existing cart
    const { data: existingCart } = await supabase
      .from('cart_items')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (existingCart && existingCart.length > 0) {
      setShowConfirm(true);
      return;
    }

    await executeReorder();
  };

  const executeReorder = async () => {
    if (!user) return;
    setShowConfirm(false);
    setIsLoading(true);
    try {
      const productIds = orderItems
        .filter(item => item.product_id)
        .map(item => item.product_id);

      // ORDER-01 FIX: Also check approval_status to prevent reordering suspended/rejected products
      const { data: availableProducts } = await supabase
        .from('products')
        .select('id, price, seller_id')
        .in('id', productIds)
        .eq('is_available', true)
        .eq('approval_status', 'approved');

      if (!availableProducts || availableProducts.length === 0) {
        toast.error('None of these items are currently available');
        setIsLoading(false);
        return;
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
    <>
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
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace cart?</AlertDialogTitle>
            <AlertDialogDescription>Your current cart will be cleared and replaced with items from this order.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeReorder}>Replace Cart</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
