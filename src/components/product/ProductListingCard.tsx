import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Store, Star, Clock, Truck, CheckCircle2, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { VegBadge } from '@/components/ui/veg-badge';
import { useCart } from '@/hooks/useCart';
import { ProductActionType } from '@/types/database';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { ACTION_CONFIG } from '@/lib/marketplace-constants';
import { ContactSellerModal } from './ContactSellerModal';
import { cn } from '@/lib/utils';

export interface ProductWithSeller {
  id: string;
  seller_id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
  is_veg: boolean;
  is_available: boolean;
  is_bestseller: boolean;
  is_recommended: boolean;
  is_urgent: boolean;
  description: string | null;
  action_type?: ProductActionType | string | null;
  contact_phone?: string | null;
  // Marketplace-grade fields
  mrp?: number | null;
  brand?: string | null;
  unit_type?: string | null;
  price_per_unit?: string | null;
  stock_quantity?: number | null;
  serving_size?: string | null;
  spice_level?: string | null;
  cuisine_type?: string | null;
  service_scope?: string | null;
  visit_charge?: number | null;
  minimum_charge?: number | null;
  delivery_time_text?: string | null;
  tags?: string[] | null;
  discount_percentage?: number | null;
  service_duration_minutes?: number | null;
  prep_time_minutes?: number | null;
  warranty_period?: string | null;
  // Seller metadata
  seller_name?: string;
  seller_rating?: number;
  seller_reviews?: number;
  seller_verified?: boolean;
  completed_order_count?: number;
  fulfillment_mode?: string | null;
  delivery_note?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

type CardLayout = 'auto' | 'ecommerce' | 'food' | 'service';

interface ProductListingCardProps {
  product: ProductWithSeller;
  layout?: CardLayout;
  parentGroup?: string | null;
  onTap?: (product: ProductWithSeller) => void;
  className?: string;
  viewOnly?: boolean;
}

const SPICE_EMOJI: Record<string, string> = {
  mild: '🌶️',
  medium: '🌶️🌶️',
  hot: '🌶️🌶️🌶️',
  extra_hot: '🔥',
};

const FOOD_GROUPS = ['food', 'grocery'];
const SERVICE_GROUPS = ['services', 'personal', 'professional', 'events'];

export function ProductListingCard({
  product,
  layout = 'auto',
  parentGroup,
  onTap,
  className,
  viewOnly = false,
}: ProductListingCardProps) {
  const navigate = useNavigate();
  const { items, addItem, updateQuantity } = useCart();
  const { configs: categoryConfigs } = useCategoryConfigs();
  const [contactOpen, setContactOpen] = useState(false);

  const cartItem = items.find((item) => item.product_id === product.id);
  const quantity = cartItem?.quantity || 0;

  const actionType: ProductActionType = (product.action_type as ProductActionType) || 'add_to_cart';
  const config = ACTION_CONFIG[actionType] || ACTION_CONFIG.add_to_cart;

  // Resolve parent_group for layout detection
  const resolvedParentGroup = useMemo(() => {
    if (parentGroup) return parentGroup;
    const cat = categoryConfigs.find(c => c.category === product.category);
    return (cat as any)?.parentGroup || (cat as any)?.parent_group || null;
  }, [parentGroup, categoryConfigs, product.category]);

  // Determine layout
  const resolvedLayout = useMemo((): 'ecommerce' | 'food' | 'service' => {
    if (layout !== 'auto') return layout as any;
    if (resolvedParentGroup) {
      if (FOOD_GROUPS.includes(resolvedParentGroup)) return 'food';
      if (SERVICE_GROUPS.includes(resolvedParentGroup)) return 'service';
    }
    return 'ecommerce';
  }, [layout, resolvedParentGroup]);

  // Cart support check
  const isCartAction = useMemo(() => {
    if (!config.isCart) return false;
    const catConfig = categoryConfigs.find(c => c.category === product.category);
    if (catConfig) return catConfig.behavior?.supportsCart ?? false;
    return actionType === 'add_to_cart' || actionType === 'buy_now';
  }, [config.isCart, categoryConfigs, product.category, actionType]);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (actionType === 'contact_seller') {
      setContactOpen(true);
      return;
    }
    addItem(product as any);
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
    if (onTap) {
      onTap(product);
    } else {
      navigate(`/seller/${product.seller_id}`);
    }
  };

  // Badge logic
  const badges: { label: string; variant: 'bestseller' | 'new' | 'limited' }[] = [];
  if (product.is_bestseller) badges.push({ label: 'Bestseller', variant: 'bestseller' });
  if (product.tags?.includes('New Arrival')) badges.push({ label: 'New', variant: 'new' });
  if (product.stock_quantity != null && product.stock_quantity > 0 && product.stock_quantity <= 5) {
    badges.push({ label: `Only ${product.stock_quantity} left!`, variant: 'limited' });
  }

  const showVegBadge = resolvedLayout === 'food' || (product.is_veg !== undefined && product.is_veg !== null);
  const sellerName = product.seller_name || (product.seller as any)?.business_name || 'Seller';
  const isOutOfStock = !product.is_available;

  const badgeColors: Record<string, string> = {
    bestseller: 'bg-accent text-accent-foreground',
    new: 'bg-primary text-primary-foreground',
    limited: 'bg-destructive text-destructive-foreground',
  };

  return (
    <>
      <div
        onClick={handleCardClick}
        className={cn(
          'bg-card rounded-xl border border-border/60 cursor-pointer transition-all hover:shadow-md flex flex-col h-full group',
          isOutOfStock && 'opacity-75',
          className
        )}
      >
        {/* ── Image Section ── */}
        <div className="relative p-2.5 pb-0">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-muted/30">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-contain transition-transform group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted/50">
                <span className="text-3xl">
                  {resolvedLayout === 'food' ? '🍽️' : resolvedLayout === 'service' ? '🛠️' : '🛍️'}
                </span>
              </div>
            )}

            {/* Out of stock overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg">
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded">Out of stock</span>
              </div>
            )}

            {/* Top-left badges */}
            {badges.length > 0 && (
              <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                {badges.slice(0, 2).map((b, i) => (
                  <Badge
                    key={i}
                    className={cn(
                      'text-[9px] px-1.5 py-0 h-[18px] font-bold shadow-sm rounded-sm border-0',
                      badgeColors[b.variant]
                    )}
                  >
                    {b.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Veg/NonVeg badge */}
            {showVegBadge && (
              <div className="absolute top-1.5 right-1.5">
                <VegBadge isVeg={product.is_veg} size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* ── Content Section ── */}
        <div className="px-2.5 pb-2.5 pt-1.5 flex flex-col flex-1 gap-0.5">
          {/* Brand (ecommerce only) */}
          {resolvedLayout === 'ecommerce' && product.brand && (
            <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wide truncate">
              {product.brand}
            </span>
          )}

          {/* Product name */}
          <h4 className="font-semibold text-xs leading-tight line-clamp-2 text-foreground min-h-[2rem]">
            {product.name}
          </h4>

          {/* ── Layout-specific metadata ── */}
          {resolvedLayout === 'ecommerce' && (
            <EcommerceMetadata product={product} sellerName={sellerName} />
          )}
          {resolvedLayout === 'food' && (
            <FoodMetadata product={product} sellerName={sellerName} />
          )}
          {resolvedLayout === 'service' && (
            <ServiceMetadata product={product} sellerName={sellerName} />
          )}

          <div className="flex-1" />

          {/* ── Price + Action Row ── */}
          <div className="flex items-end justify-between mt-1.5 gap-1">
            <PriceBlock product={product} actionType={actionType} />

            <div className="shrink-0">
              {viewOnly ? (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/seller/${product.seller_id}`); }}
                  className="border border-primary text-primary font-bold text-xs px-3 py-1 rounded-md hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  View
                </button>
              ) : isCartAction && !isOutOfStock ? (
                quantity === 0 ? (
                  <button
                    onClick={handleAdd}
                    className="border border-success text-success font-bold text-xs px-3 py-1 rounded-md hover:bg-success hover:text-white transition-colors"
                  >
                    {config.shortLabel}
                  </button>
                ) : (
                  <div className="flex items-center bg-success rounded-md overflow-hidden">
                    <button onClick={handleDecrement} className="px-2 py-1 text-white hover:bg-success/80 transition-colors">
                      <Minus size={12} />
                    </button>
                    <span className="font-bold text-xs text-white px-1 min-w-[16px] text-center">{quantity}</span>
                    <button onClick={handleIncrement} className="px-2 py-1 text-white hover:bg-success/80 transition-colors">
                      <Plus size={12} />
                    </button>
                  </div>
                )
              ) : !isOutOfStock ? (
                <span className="text-[10px] font-medium text-primary">
                  {product.is_available ? 'View →' : 'Unavailable'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {actionType === 'contact_seller' && (
        <ContactSellerModal
          open={contactOpen}
          onOpenChange={setContactOpen}
          sellerName={sellerName}
          phone={product.contact_phone || ''}
        />
      )}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────

function SellerRow({ name, verified }: { name: string; verified?: boolean }) {
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <Store size={9} className="text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground truncate">{name}</span>
      {verified && <CheckCircle2 size={9} className="text-primary shrink-0" />}
    </div>
  );
}

function EcommerceMetadata({ product, sellerName }: { product: ProductWithSeller; sellerName: string }) {
  return (
    <>
      {product.unit_type && (
        <span className="text-[10px] text-muted-foreground">
          {product.price_per_unit || product.unit_type}
        </span>
      )}
      <SellerRow name={sellerName} verified={product.seller_verified} />
      {product.delivery_time_text && (
        <div className="flex items-center gap-1 mt-0.5">
          <Truck size={9} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{product.delivery_time_text}</span>
        </div>
      )}
    </>
  );
}

function FoodMetadata({ product, sellerName }: { product: ProductWithSeller; sellerName: string }) {
  return (
    <>
      <SellerRow name={sellerName} verified={product.seller_verified} />
      {product.cuisine_type && (
        <span className="text-[10px] text-muted-foreground">{product.cuisine_type}</span>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {product.serving_size && (
          <span className="text-[10px] text-muted-foreground">{product.serving_size}</span>
        )}
        {product.prep_time_minutes && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock size={8} /> ~{product.prep_time_minutes}m
          </span>
        )}
      </div>
      {product.spice_level && (
        <span className="text-[10px] text-muted-foreground">
          Spice: {product.spice_level} {SPICE_EMOJI[product.spice_level] || ''}
        </span>
      )}
    </>
  );
}

function ServiceMetadata({ product, sellerName }: { product: ProductWithSeller; sellerName: string }) {
  return (
    <>
      <SellerRow name={sellerName} verified={product.seller_verified} />
      {product.service_duration_minutes && (
        <div className="flex items-center gap-1 mt-0.5">
          <Clock size={9} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{product.service_duration_minutes} min</span>
        </div>
      )}
      {product.fulfillment_mode && (
        <span className="text-[9px] text-primary/80 font-medium mt-0.5">
          {product.fulfillment_mode === 'delivery' ? '🚚 Delivery' : product.fulfillment_mode === 'self_pickup' ? '📍 Pickup' : '🚚 Delivery & Pickup'}
        </span>
      )}
      {product.visit_charge != null && product.visit_charge > 0 && (
        <span className="text-[10px] text-muted-foreground">Visit charge: ₹{product.visit_charge}</span>
      )}
    </>
  );
}

function PriceBlock({ product, actionType }: { product: ProductWithSeller; actionType: ProductActionType }) {
  if (actionType === 'contact_seller') {
    return <span className="text-[10px] font-medium text-muted-foreground">Contact for price</span>;
  }

  const hasDiscount = product.mrp && product.mrp > product.price;

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1.5">
        <span className="font-bold text-sm text-foreground leading-tight">₹{product.price}</span>
        {hasDiscount && (
          <>
            <span className="text-[10px] text-muted-foreground line-through">₹{product.mrp}</span>
            <span className="text-[9px] font-bold text-success">
              {product.discount_percentage || Math.round(((product.mrp! - product.price) / product.mrp!) * 100)}% OFF
            </span>
          </>
        )}
      </div>
      {product.minimum_charge != null && product.minimum_charge > 0 && (
        <span className="text-[9px] text-muted-foreground">Min ₹{product.minimum_charge}</span>
      )}
    </div>
  );
}
