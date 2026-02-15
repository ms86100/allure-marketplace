import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { VegBadge } from '@/components/ui/veg-badge';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/hooks/useCart';
import { Plus, Minus, Store, Star, MapPin, Home, Clock, Truck } from 'lucide-react';

interface ProductDetail {
  product_id: string;
  product_name: string;
  price: number;
  image_url: string | null;
  is_veg: boolean | null;
  category: string | null;
  description?: string | null;
  prep_time_minutes?: number | null;
  fulfillment_mode?: string | null;
  delivery_note?: string | null;
  seller_id: string;
  seller_name: string;
  seller_rating: number;
  seller_reviews: number;
  society_name: string | null;
  distance_km: number | null;
  is_same_society: boolean;
}

interface ProductDetailSheetProps {
  product: ProductDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryIcon?: string;
  categoryName?: string;
}

export function ProductDetailSheet({
  product,
  open,
  onOpenChange,
  categoryIcon,
  categoryName,
}: ProductDetailSheetProps) {
  const { items, addItem, updateQuantity } = useCart();

  if (!product) return null;

  const cartItem = items.find((item) => item.product_id === product.product_id);
  const quantity = cartItem?.quantity || 0;

  const handleAdd = () => {
    addItem({
      id: product.product_id,
      seller_id: product.seller_id,
      name: product.product_name,
      price: product.price,
      image_url: product.image_url,
      is_veg: product.is_veg ?? true,
      is_available: true,
      category: product.category as any,
      description: product.description || null,
      is_bestseller: false,
      is_recommended: false,
      is_urgent: false,
      created_at: '',
      updated_at: '',
    });
  };

  const isNewSeller = product.seller_reviews === 0 || product.seller_rating === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{product.product_name}</SheetTitle>
        </SheetHeader>

        {/* Product Image */}
        <div className="relative w-full aspect-[16/10] bg-muted">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.product_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-5xl">{categoryIcon || '🛍️'}</span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Name + Price */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              {product.is_veg !== null && <VegBadge isVeg={product.is_veg} size="sm" className="mt-1" />}
              <div>
                <h2 className="font-bold text-lg leading-tight">{product.product_name}</h2>
                {categoryName && (
                  <span className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    {categoryIcon && <span>{categoryIcon}</span>}
                    {categoryName}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xl font-bold text-primary whitespace-nowrap">₹{product.price}</span>
          </div>

          {/* Prep time */}
          {product.prep_time_minutes && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock size={14} />
              <span>Ready in ~{product.prep_time_minutes} min</span>
            </div>
          )}

          {/* Fulfillment info */}
          {product.fulfillment_mode && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Truck size={14} />
              <span>
                {product.fulfillment_mode === 'self_pickup' && 'Self Pickup Only'}
                {product.fulfillment_mode === 'delivery' && 'Seller Delivers'}
                {product.fulfillment_mode === 'both' && 'Pickup or Delivery'}
              </span>
              {product.delivery_note && (
                <span className="italic text-xs">— {product.delivery_note}</span>
              )}
            </div>
          )}

          {/* Description */}
          {product.description && (
            <p className="text-sm text-muted-foreground">{product.description}</p>
          )}

          {/* Seller Info */}
          <Link
            to={`/seller/${product.seller_id}`}
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 bg-muted rounded-xl p-3"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Store size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{product.seller_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {isNewSeller ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    New Seller
                  </Badge>
                ) : (
                  <span className="flex items-center gap-0.5 text-xs">
                    <span className="flex items-center gap-0.5 bg-success px-1.5 py-0.5 rounded text-white text-[10px] font-semibold">
                      {Number(product.seller_rating).toFixed(1)}
                      <Star size={9} className="fill-white" />
                    </span>
                    <span className="text-muted-foreground ml-1">({product.seller_reviews})</span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {product.is_same_society ? (
                <span className="flex items-center gap-0.5 text-primary">
                  <Home size={11} /> Your community
                </span>
              ) : (
                <span className="flex items-center gap-0.5">
                  <MapPin size={11} />
                  {product.distance_km != null ? `${product.distance_km} km` : product.society_name}
                </span>
              )}
            </div>
          </Link>

          {/* Add to Cart */}
          <div className="pt-2">
            {quantity === 0 ? (
              <Button className="w-full h-12 text-base" onClick={handleAdd}>
                <Plus size={18} className="mr-2" />
                Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-between bg-primary rounded-xl px-4 h-12">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={() => updateQuantity(product.product_id, quantity - 1)}
                >
                  <Minus size={18} />
                </Button>
                <span className="text-lg font-bold text-primary-foreground">{quantity}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={() => updateQuantity(product.product_id, quantity + 1)}
                >
                  <Plus size={18} />
                </Button>
              </div>
            )}
          </div>

          {/* View Full Menu link */}
          <Link
            to={`/seller/${product.seller_id}`}
            onClick={() => onOpenChange(false)}
            className="block text-center text-sm text-primary font-medium py-2"
          >
            View Seller's Full Menu →
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
