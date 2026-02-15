import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Minus, Clock, MessageCircle, Calendar, Truck, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VegBadge } from '@/components/ui/veg-badge';
import { useCart } from '@/hooks/useCart';
import { Product } from '@/types/database';
import { CategoryBehavior } from '@/types/categories';
import { cn } from '@/lib/utils';
import { ProductTrustMetric, formatLastOrdered } from '@/hooks/queries/useProductTrustMetrics';

export interface ProductWithSeller extends Product {
  seller_name?: string;
  seller_rating?: number;
  seller_id: string;
  fulfillment_mode?: string | null;
  delivery_note?: string | null;
}

interface ProductGridCardProps {
  product: ProductWithSeller;
  behavior?: CategoryBehavior | null;
  onTap?: (product: ProductWithSeller) => void;
  trustMetric?: ProductTrustMetric | null;
  className?: string;
}

export function ProductGridCard({ product, behavior, onTap, trustMetric, className }: ProductGridCardProps) {
  const { items, addItem, updateQuantity } = useCart();
  const cartItem = items.find((item) => item.product_id === product.id);
  const quantity = cartItem?.quantity || 0;

  const isService = behavior && (behavior.requiresTimeSlot || behavior.hasDuration || behavior.enquiryOnly);
  const supportsCart = behavior?.supportsCart ?? true;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    addItem(product);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateQuantity(product.id, quantity + 1);
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateQuantity(product.id, quantity - 1);
  };

  const handleCardClick = () => {
    onTap?.(product);
  };

  const actionLabel = behavior?.enquiryOnly
    ? 'Contact'
    : behavior?.requiresTimeSlot
      ? 'Book'
      : 'Add';

  const ActionIcon = behavior?.enquiryOnly
    ? MessageCircle
    : behavior?.requiresTimeSlot
      ? Calendar
      : Plus;

  // Trust signal formatting
  const lastOrdered = trustMetric ? formatLastOrdered(trustMetric.last_ordered_at) : null;
  const buyerCount = trustMetric?.unique_buyers || 0;

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'bg-card rounded-xl overflow-hidden shadow-sm border border-border/50 cursor-pointer transition-all hover:shadow-md flex flex-col',
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-[4/3]">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-3xl">{isService ? '🛠️' : '🍽️'}</span>
          </div>
        )}

        {!product.is_available && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-xs font-medium text-muted-foreground">Unavailable</span>
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
          {product.is_bestseller && (
            <Badge className="bg-accent text-accent-foreground text-[9px] px-1.5 py-0 h-4 font-semibold">
              🔥 Popular
            </Badge>
          )}
        </div>

        {/* Veg badge */}
        <div className="absolute top-1.5 right-1.5">
          <VegBadge isVeg={product.is_veg} size="sm" />
        </div>

        {/* Community proof overlay at bottom of image */}
        {buyerCount > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
            <span className="text-[10px] text-white font-medium flex items-center gap-1">
              <Users size={10} />
              {buyerCount} {buyerCount === 1 ? 'family' : 'families'} ordered
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-2.5 flex flex-col flex-1">
        <h4 className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</h4>

        {/* Seller identity - humanized */}
        {product.seller_name && (
          <Link
            to={`/seller/${product.seller_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-muted-foreground mt-0.5 truncate hover:text-primary transition-colors"
          >
            by {product.seller_name}
          </Link>
        )}

        {/* Price + time row */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-bold text-sm text-foreground">
            {isService && !behavior?.enquiryOnly ? 'From ' : ''}₹{product.price}
          </span>
          {product.prep_time_minutes && !isService && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 bg-muted px-1.5 py-0.5 rounded-full">
              <Clock size={9} />
              {product.prep_time_minutes}m
            </span>
          )}
          {isService && product.service_duration_minutes && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 bg-muted px-1.5 py-0.5 rounded-full">
              <Clock size={9} />
              {product.service_duration_minutes >= 60
                ? `${Math.floor(product.service_duration_minutes / 60)}h`
                : `${product.service_duration_minutes}m`}
            </span>
          )}
        </div>

        {/* Trust signals row */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {/* Fulfillment mode */}
          {product.fulfillment_mode && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
              <Truck size={8} />
              {product.fulfillment_mode === 'self_pickup' && 'Pickup'}
              {product.fulfillment_mode === 'delivery' && 'Delivery'}
              {product.fulfillment_mode === 'both' && 'Pickup/Delivery'}
            </span>
          )}
          {/* Recency signal */}
          {lastOrdered && (
            <span className="text-[9px] text-success font-medium">
              Ordered {lastOrdered}
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action */}
        <div className="mt-2">
          {supportsCart && !isService ? (
            quantity === 0 ? (
              <Button
                size="sm"
                variant="default"
                className="w-full h-8 text-xs font-semibold"
                onClick={handleAdd}
                disabled={!product.is_available}
              >
                <Plus size={14} className="mr-1" /> Add
              </Button>
            ) : (
              <div className="flex items-center justify-between bg-primary rounded-lg h-8 px-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={handleDecrement}
                >
                  <Minus size={14} />
                </Button>
                <span className="font-bold text-sm text-primary-foreground">{quantity}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={handleIncrement}
                >
                  <Plus size={14} />
                </Button>
              </div>
            )
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs font-semibold border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onTap?.(product);
              }}
              disabled={!product.is_available}
            >
              <ActionIcon size={14} className="mr-1" /> {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
