import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { Plus, Minus, Store, Clock } from 'lucide-react';
import { hapticSelection } from '@/lib/haptics';
import { Badge } from '@/components/ui/badge';
import { VegBadge } from '@/components/ui/veg-badge';
import { useCart } from '@/hooks/useCart';
import { Product, ProductActionType } from '@/types/database';
import { ACTION_CONFIG, deriveActionType } from '@/lib/marketplace-constants';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { computeStoreStatus, formatStoreClosedMessage } from '@/lib/store-availability';
import { useCategoryConfig } from '@/hooks/queries/useCategoryConfig';

export interface ProductWithSeller extends Product {
  seller_name?: string;
  seller_rating?: number;
  seller_id: string;
  fulfillment_mode?: string | null;
  delivery_note?: string | null;
  seller_availability_start?: string | null;
  seller_availability_end?: string | null;
  seller_operating_days?: string[] | null;
  seller_is_available?: boolean | null;
}

interface ProductGridCardProps {
  product: ProductWithSeller;
  behavior?: any;
  onTap?: (product: ProductWithSeller) => void;
  className?: string;
  viewOnly?: boolean;
}

export function ProductGridCard({ product, behavior, onTap, className, viewOnly = false }: ProductGridCardProps) {
  const navigate = useNavigate();
  const { items, addItem, updateQuantity } = useCart();
  const { formatPrice } = useCurrency();

  const { data: categoryConfigs } = useCategoryConfig();
  const categoryTransactionType = categoryConfigs?.find(c => c.category === product.category)?.transactionType ?? null;
  const actionType: ProductActionType = deriveActionType(product.action_type as string, categoryTransactionType);
  const actionConfig = ACTION_CONFIG[actionType];
  const isCartAction = actionConfig.isCart;

  const cartItem = isCartAction ? items.find((item) => item.product_id === product.id) : null;
  const quantity = cartItem?.quantity || 0;

  const storeAvailability = useMemo(() => {
    return computeStoreStatus(
      product.seller_availability_start || (product as any)?.seller?.availability_start,
      product.seller_availability_end || (product as any)?.seller?.availability_end,
      product.seller_operating_days || (product as any)?.seller?.operating_days,
      product.seller_is_available ?? (product as any)?.seller?.is_available ?? true
    );
  }, [product.seller_availability_start, product.seller_availability_end, product.seller_operating_days, product.seller_is_available]);

  const isStoreClosed = storeAvailability.status !== 'open';
  const storeClosedMessage = isStoreClosed ? formatStoreClosedMessage(storeAvailability) : '';

  const handleAdd = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); if (!isCartAction) { if (onTap) onTap(product); return; } addItem(product); };
  const handleIncrement = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); updateQuantity(product.id, quantity + 1); };
  const handleDecrement = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); updateQuantity(product.id, quantity - 1); };
  const handleCardClick = () => { hapticSelection(); if (onTap) { onTap(product); } else { navigate(`/seller/${product.seller_id}`); } };

  const isOutOfStock = !product.is_available;

  return (
    <div onClick={handleCardClick} className={cn('bg-card rounded-xl border border-border cursor-pointer flex flex-col h-full relative', 'transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]', isOutOfStock && 'opacity-50 grayscale-[40%]', isStoreClosed && !isOutOfStock && 'opacity-60 grayscale-[30%]', className)}>
      <div className="relative p-2 pb-0">
        <div className="relative aspect-square rounded-[10px] overflow-hidden product-image-bg">
          <img src={product.image_url || `https://picsum.photos/seed/${product.id}/300/300`} alt={product.name} className={cn("w-full h-full", product.image_url ? "object-contain" : "object-cover")} loading="lazy" />
          {isOutOfStock && (<div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded-[10px]"><span className="text-[9px] font-bold text-muted-foreground uppercase">Out of stock</span></div>)}
          {isStoreClosed && !isOutOfStock && (<div className="absolute inset-0 bg-background/40 flex items-center justify-center rounded-[10px]"><span className="text-[8px] font-bold text-muted-foreground bg-muted/90 px-1.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1"><Clock size={8} />{storeClosedMessage || 'Closed'}</span></div>)}
          {product.is_bestseller && (<Badge className="absolute top-1 left-1 bg-badge-new text-primary-foreground text-[8px] px-1.5 py-0.5 font-bold shadow-sm rounded border-0">Bestseller</Badge>)}
          <div className="absolute top-1 right-1"><VegBadge isVeg={product.is_veg} size="sm" /></div>
        </div>
        {!viewOnly && !isOutOfStock && !isStoreClosed && (
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10">
            {isCartAction && quantity > 0 ? (
              <div className="flex items-center bg-primary rounded-lg overflow-hidden shadow-cta animate-stepper-pop">
                <button onClick={handleDecrement} className="px-2.5 py-1.5 text-primary-foreground"><Minus size={13} strokeWidth={3} /></button>
                <span className="font-bold text-xs text-primary-foreground min-w-[20px] text-center">{quantity}</span>
                <button onClick={handleIncrement} className="px-2.5 py-1.5 text-primary-foreground"><Plus size={13} strokeWidth={3} /></button>
              </div>
            ) : (
              <button onClick={handleAdd} className="bg-primary text-primary-foreground font-bold text-[11px] px-5 py-1.5 rounded-lg shadow-cta hover:opacity-90 transition-all uppercase tracking-wide active:scale-95">{actionConfig.shortLabel}</button>
            )}
          </div>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-4 flex flex-col flex-1">
        <h4 className="font-semibold text-[12px] leading-tight line-clamp-2 text-foreground mb-0.5">{product.name}</h4>
        {product.seller_name && (<div className="flex items-center gap-1 mt-0.5"><Store size={9} className="text-muted-foreground shrink-0" /><span className="text-[10px] text-muted-foreground truncate">{product.seller_name}</span></div>)}
        <div className="flex-1 min-h-0.5" />
        <div className="flex items-end gap-1 mt-auto"><span className="font-semibold text-[13px] text-foreground leading-none tabular-nums">{formatPrice(product.price)}</span></div>
      </div>
    </div>
  );
}
