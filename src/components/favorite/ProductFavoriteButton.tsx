// @ts-nocheck
import { useState, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { hapticImpact } from '@/lib/haptics';
import { toast } from 'sonner';

interface ProductFavoriteButtonProps {
  productId: string;
  initialFavorite?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  onToggle?: (isFavorite: boolean) => void;
}

export function ProductFavoriteButton({ productId, initialFavorite = false, size = 'sm', className, onToggle }: ProductFavoriteButtonProps) {
  const { user } = useAuth();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isLoading, setIsLoading] = useState(false);

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error('Please log in to save products');
      return;
    }
    if (isLoading) return;
    setIsLoading(true);
    hapticImpact('light');

    try {
      if (isFavorite) {
        await supabase.from('product_favorites' as any).delete().eq('user_id', user.id).eq('product_id', productId);
        setIsFavorite(false);
        onToggle?.(false);
      } else {
        await supabase.from('product_favorites' as any).insert({ user_id: user.id, product_id: productId } as any);
        setIsFavorite(true);
        onToggle?.(true);
        toast.success('Saved to favorites');
      }
    } catch {
      toast.error('Failed to update favorites');
    } finally {
      setIsLoading(false);
    }
  }, [user, productId, isFavorite, isLoading, onToggle]);

  const iconSize = size === 'sm' ? 14 : 18;

  return (
    <button
      onClick={toggle}
      disabled={isLoading}
      className={cn(
        'rounded-full flex items-center justify-center transition-all',
        size === 'sm' ? 'w-7 h-7' : 'w-9 h-9',
        isFavorite ? 'text-destructive' : 'text-muted-foreground hover:text-destructive',
        className
      )}
      aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
    >
      <Heart size={iconSize} fill={isFavorite ? 'currentColor' : 'none'} strokeWidth={2} />
    </button>
  );
}
