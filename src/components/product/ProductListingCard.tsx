import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Store, Star, Clock, Truck, CheckCircle2, Shield, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { VegBadge } from '@/components/ui/veg-badge';
import { useCart } from '@/hooks/useCart';
import { ProductActionType } from '@/types/database';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useParentGroups } from '@/hooks/useParentGroups';
import { useMarketplaceConfig } from '@/hooks/useMarketplaceConfig';
import { ACTION_CONFIG } from '@/lib/marketplace-constants';
import { useCardAnalytics } from '@/hooks/useCardAnalytics';
import { ContactSellerModal } from './ContactSellerModal';
import { cn } from '@/lib/utils';

/* ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

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

/* ━━━ Constants — kept only for spice display (visual emoji, not logic) ━━━ */

const SPICE_EMOJI: Record<string, string> = {
  mild: '🌶️',
  medium: '🌶️🌶️',
  hot: '🌶️🌶️🌶️',
  extra_hot: '🔥',
};

/* Badge priority: bestseller > limited > new > trending (max 2) */
type BadgeVariant = 'bestseller' | 'limited' | 'new' | 'trending';

const BADGE_STYLES: Record<BadgeVariant, string> = {
  bestseller: 'bg-accent text-accent-foreground',
  limited: 'bg-destructive text-destructive-foreground animate-low-stock-pulse',
  new: 'bg-info text-primary-foreground',
  trending: 'bg-primary text-primary-foreground',
};

/* ━━━ Main Component ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

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
  const { layoutMap } = useParentGroups();
  const marketplaceConfig = useMarketplaceConfig();
  const [contactOpen, setContactOpen] = useState(false);

  const cartItem = items.find((item) => item.product_id === product.id);
  const quantity = cartItem?.quantity || 0;

  const actionType: ProductActionType = (product.action_type as ProductActionType) || 'add_to_cart';
  const config = ACTION_CONFIG[actionType] || ACTION_CONFIG.add_to_cart;

  /* ── Category config lookup ── */
  const catConfig = useMemo(() => {
    return categoryConfigs.find(c => c.category === product.category) || null;
  }, [categoryConfigs, product.category]);

  /* ── Layout resolution — fully DB-driven via parent_groups.layout_type ── */
  const resolvedParentGroup = useMemo(() => {
    if (parentGroup) return parentGroup;
    return catConfig?.parentGroup || null;
  }, [parentGroup, catConfig]);

  const resolvedLayout = useMemo((): 'ecommerce' | 'food' | 'service' => {
    if (layout !== 'auto') return layout as 'ecommerce' | 'food' | 'service';
    if (resolvedParentGroup && layoutMap[resolvedParentGroup]) {
      return layoutMap[resolvedParentGroup];
    }
    return 'ecommerce';
  }, [layout, resolvedParentGroup, layoutMap]);

  const isCartAction = useMemo(() => {
    if (!config.isCart) return false;
    if (catConfig) return catConfig.behavior?.supportsCart ?? false;
    return actionType === 'add_to_cart' || actionType === 'buy_now';
  }, [config.isCart, catConfig, actionType]);

  /* ── DB-driven display flags ── */
  const showVegBadge = catConfig?.formHints?.showVegToggle ?? (resolvedLayout === 'food');
  const placeholderEmoji = catConfig?.formHints?.placeholderEmoji
    || (resolvedLayout === 'food' ? '🍽️' : resolvedLayout === 'service' ? '🛠️' : '🛒');
  const pricePrefix = catConfig?.formHints?.pricePrefix || (resolvedLayout === 'service' ? 'Starting ' : '');
  const buttonLabel = catConfig?.formHints?.primaryButtonLabel || config.shortLabel;

  /* ── Analytics ── */
  const { ref: cardRef, onCardClick: trackClick, onAddClick: trackAdd } = useCardAnalytics({
    productId: product.id,
    category: product.category,
    price: product.price,
    sellerId: product.seller_id,
    layout: resolvedLayout,
  });

  /* ── Handlers ── */
  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    trackAdd();
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
    trackClick();
    if (onTap) onTap(product);
    else navigate(`/seller/${product.seller_id}`);
  };

  /* ── Derived values — DB-driven thresholds ── */
  const sellerName = product.seller_name || (product.seller as any)?.business_name || 'Seller';
  const isOutOfStock = !product.is_available;
  const lowStockThreshold = marketplaceConfig.lowStockThreshold;
  const isLowStock = product.stock_quantity != null && product.stock_quantity > 0 && product.stock_quantity <= lowStockThreshold;

  /* Badge system — max 2, priority ordered, driven by product.tags[] and product flags */
  const badges: { label: string; variant: BadgeVariant }[] = [];
  if (product.is_bestseller) badges.push({ label: 'Bestseller', variant: 'bestseller' });
  if (isLowStock) badges.push({ label: `Only ${product.stock_quantity} left!`, variant: 'limited' });
  if (product.tags?.includes('New Arrival') && badges.length < 2) badges.push({ label: 'New', variant: 'new' });
  if (product.tags?.includes('Trending') && badges.length < 2) badges.push({ label: 'Trending', variant: 'trending' });

  /* Image aspect ratio per layout */
  const imageAspect = resolvedLayout === 'food' ? 'aspect-[4/3]'
    : resolvedLayout === 'service' ? 'aspect-[16/10]'
    : 'aspect-square';

  const imageObjectFit = resolvedLayout === 'ecommerce' ? 'object-contain' : 'object-cover';

  return (
    <>
      <div
        ref={cardRef}
        onClick={handleCardClick}
        className={cn(
          'bg-card rounded-xl border border-border/50 cursor-pointer flex flex-col h-full group',
          'transition-all duration-200 ease-out',
          'hover:shadow-lg hover:border-border/80',
          'active:scale-[0.98] md:active:scale-100',
          isOutOfStock && 'opacity-60 grayscale-[30%]',
          className
        )}
      >
        {/* ━━━ IMAGE SECTION ━━━ */}
        <div className="relative p-2 pb-0">
          <div className={cn(
            'relative rounded-lg overflow-hidden bg-muted/40',
            imageAspect
          )}>
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className={cn(
                  'w-full h-full transition-transform duration-200 ease-out',
                  imageObjectFit,
                  'md:group-hover:scale-[1.03]'
                )}
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted/50">
                <span className="text-3xl">{placeholderEmoji}</span>
              </div>
            )}

            {/* Out of stock overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center rounded-lg">
                <span className="text-[10px] font-bold text-muted-foreground bg-muted/90 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Out of stock
                </span>
              </div>
            )}

            {/* Top-left badges — vertical stack, max 2 */}
            {badges.length > 0 && (
              <div className="absolute top-1.5 left-1.5 flex flex-col gap-0.5">
                {badges.slice(0, 2).map((b, i) => (
                  <Badge
                    key={i}
                    className={cn(
                      'text-[9px] leading-none px-1.5 py-0.5 font-bold shadow-sm rounded border-0',
                      BADGE_STYLES[b.variant]
                    )}
                  >
                    {b.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Veg/NonVeg badge — driven by category_config.show_veg_toggle */}
            {showVegBadge && (
              <div className="absolute top-1.5 right-1.5">
                <VegBadge isVeg={product.is_veg} size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* ━━━ CONTENT SECTION ━━━ */}
        <div className="px-3 pb-3 pt-2 flex flex-col flex-1 space-y-1">
          {/* Brand (ecommerce only) */}
          {resolvedLayout === 'ecommerce' && product.brand && (
            <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider truncate leading-none">
              {product.brand}
            </span>
          )}

          {/* Title */}
          <h4 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground">
            {product.name}
          </h4>

          {/* Layout-specific metadata */}
          {resolvedLayout === 'ecommerce' && <EcommerceMetadata product={product} sellerName={sellerName} />}
          {resolvedLayout === 'food' && <FoodMetadata product={product} sellerName={sellerName} />}
          {resolvedLayout === 'service' && (
            <ServiceMetadata
              product={product}
              sellerName={sellerName}
              fulfillmentLabels={marketplaceConfig.fulfillmentLabels}
            />
          )}

          {/* Trust layer */}
          <TrustRow product={product} layout={resolvedLayout} />

          <div className="flex-1 min-h-1" />

          {/* ━━━ PRICE + ACTION ROW ━━━ */}
          <div className="flex items-end justify-between gap-2 pt-1">
            <PriceBlock product={product} actionType={actionType} pricePrefix={pricePrefix} />
            <ActionButton
              actionType={actionType}
              buttonLabel={buttonLabel}
              isCartAction={isCartAction}
              isOutOfStock={isOutOfStock}
              quantity={quantity}
              viewOnly={viewOnly}
              onAdd={handleAdd}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              sellerId={product.seller_id}
              isAvailable={product.is_available}
            />
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SUB-COMPONENTS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── Seller Row ── */
function SellerRow({ name, verified }: { name: string; verified?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <Store size={10} className="text-muted-foreground shrink-0" />
      <span className="text-xs font-medium text-muted-foreground truncate">{name}</span>
      {verified && <CheckCircle2 size={10} className="text-primary shrink-0 fill-primary/10" />}
    </div>
  );
}

/* ── Trust Row — rating, social proof, trust badges ── */
function TrustRow({ product, layout }: { product: ProductWithSeller; layout: string }) {
  const hasRating = product.seller_rating && product.seller_rating > 0;
  const hasOrders = product.completed_order_count && product.completed_order_count > 0;

  if (!hasRating && !hasOrders && !product.warranty_period) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {hasRating && (
        <div className="flex items-center gap-0.5 bg-success/10 text-success px-1.5 py-0.5 rounded">
          <Star size={9} className="fill-current" />
          <span className="text-[10px] font-bold leading-none">{product.seller_rating}</span>
          {product.seller_reviews != null && product.seller_reviews > 0 && (
            <span className="text-[9px] font-normal text-muted-foreground leading-none">
              ({product.seller_reviews > 1000 ? `${(product.seller_reviews / 1000).toFixed(1)}k` : product.seller_reviews})
            </span>
          )}
        </div>
      )}
      {hasOrders && (
        <span className="text-[9px] font-medium text-muted-foreground leading-none">
          {product.completed_order_count! > 1000
            ? `${Math.floor(product.completed_order_count! / 1000)}k+ orders`
            : `${product.completed_order_count}+ orders`}
        </span>
      )}
      {layout === 'service' && product.warranty_period && (
        <div className="flex items-center gap-0.5">
          <Shield size={8} className="text-primary" />
          <span className="text-[9px] font-medium text-primary leading-none">{product.warranty_period}</span>
        </div>
      )}
    </div>
  );
}

/* ── E-commerce Metadata ── */
function EcommerceMetadata({ product, sellerName }: { product: ProductWithSeller; sellerName: string }) {
  return (
    <div className="space-y-0.5">
      {product.unit_type && (
        <span className="text-xs text-muted-foreground block">
          {product.price_per_unit || product.unit_type}
        </span>
      )}
      <SellerRow name={sellerName} verified={product.seller_verified} />
      {product.delivery_time_text && <DeliveryChip text={product.delivery_time_text} />}
    </div>
  );
}

/* ── Food Metadata ── */
function FoodMetadata({ product, sellerName }: { product: ProductWithSeller; sellerName: string }) {
  return (
    <div className="space-y-0.5">
      <SellerRow name={sellerName} verified={product.seller_verified} />
      {product.cuisine_type && (
        <span className="text-xs text-muted-foreground block">{product.cuisine_type}</span>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {product.serving_size && (
          <span className="text-xs text-muted-foreground">{product.serving_size}</span>
        )}
        {product.prep_time_minutes && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <Timer size={9} /> ~{product.prep_time_minutes}m
          </span>
        )}
      </div>
      {product.spice_level && (
        <span className="text-[10px] text-muted-foreground">
          {SPICE_EMOJI[product.spice_level] || ''} {product.spice_level}
        </span>
      )}
    </div>
  );
}

/* ── Service Metadata — fulfillment labels from DB ── */
function ServiceMetadata({
  product,
  sellerName,
  fulfillmentLabels,
}: {
  product: ProductWithSeller;
  sellerName: string;
  fulfillmentLabels: Record<string, string>;
}) {
  return (
    <div className="space-y-0.5">
      <SellerRow name={sellerName} verified={product.seller_verified} />
      {product.service_duration_minutes && (
        <div className="flex items-center gap-1">
          <Clock size={10} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{product.service_duration_minutes} min</span>
        </div>
      )}
      {product.fulfillment_mode && (
        <span className="text-[10px] text-primary font-medium">
          {fulfillmentLabels[product.fulfillment_mode] || product.fulfillment_mode}
        </span>
      )}
      {product.visit_charge != null && product.visit_charge > 0 && (
        <span className="text-xs text-muted-foreground">Visit: ₹{product.visit_charge}</span>
      )}
    </div>
  );
}

/* ── Delivery Chip — Blinkit-style ── */
function DeliveryChip({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <Truck size={10} className="text-primary shrink-0" />
      <span className="text-[10px] font-semibold text-primary leading-none">{text}</span>
    </div>
  );
}

/* ── Price Block — pricePrefix from DB ── */
function PriceBlock({
  product,
  actionType,
  pricePrefix,
}: {
  product: ProductWithSeller;
  actionType: ProductActionType;
  pricePrefix: string;
}) {
  if (actionType === 'contact_seller') {
    return <span className="text-xs font-medium text-muted-foreground italic">Contact for price</span>;
  }

  const hasDiscount = product.mrp && product.mrp > product.price;
  // Use DB-computed discount_percentage; only fallback if column is null
  const discountPct = product.discount_percentage
    || (hasDiscount ? Math.round(((product.mrp! - product.price) / product.mrp!) * 100) : 0);

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="font-bold text-base text-foreground leading-none">
          {pricePrefix}₹{product.price}
        </span>
      </div>
      {hasDiscount && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-muted-foreground line-through leading-none">₹{product.mrp}</span>
          <span className="text-[10px] font-bold text-success bg-success/10 px-1 py-0 rounded leading-none">
            {discountPct}% OFF
          </span>
        </div>
      )}
      {product.minimum_charge != null && product.minimum_charge > 0 && (
        <span className="text-[9px] text-muted-foreground mt-0.5 leading-none">Min ₹{product.minimum_charge}</span>
      )}
    </div>
  );
}

/* ── Action Button — State Machine, label from DB ── */
function ActionButton({
  actionType,
  buttonLabel,
  isCartAction,
  isOutOfStock,
  quantity,
  viewOnly,
  onAdd,
  onIncrement,
  onDecrement,
  sellerId,
  isAvailable,
}: {
  actionType: ProductActionType;
  buttonLabel: string;
  isCartAction: boolean;
  isOutOfStock: boolean;
  quantity: number;
  viewOnly: boolean;
  onAdd: (e: React.MouseEvent) => void;
  onIncrement: (e: React.MouseEvent) => void;
  onDecrement: (e: React.MouseEvent) => void;
  sellerId: string;
  isAvailable: boolean;
}) {
  const navigate = useNavigate();

  if (viewOnly) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/seller/${sellerId}`); }}
        className="border border-primary text-primary font-bold text-xs px-3.5 py-1.5 rounded-full hover:bg-primary hover:text-primary-foreground transition-colors duration-200 shrink-0"
      >
        View
      </button>
    );
  }

  if (isOutOfStock) {
    return (
      <button
        disabled
        className="bg-muted text-muted-foreground font-semibold text-[10px] px-3 py-1.5 rounded-full cursor-not-allowed shrink-0"
      >
        Sold out
      </button>
    );
  }

  // Cart-compatible: ADD → quantity stepper
  if (isCartAction) {
    if (quantity === 0) {
      return (
        <button
          onClick={onAdd}
          className="border-2 border-success text-success font-bold text-xs px-4 py-1 rounded-full hover:bg-success hover:text-white transition-colors duration-200 shrink-0 min-w-[56px]"
        >
          {buttonLabel}
        </button>
      );
    }
    return (
      <div className="flex items-center bg-success rounded-full overflow-hidden shadow-sm animate-stepper-pop shrink-0">
        <button onClick={onDecrement} className="px-2.5 py-1.5 text-white hover:bg-success/80 transition-colors">
          <Minus size={12} strokeWidth={3} />
        </button>
        <span className="font-bold text-xs text-white min-w-[18px] text-center">{quantity}</span>
        <button onClick={onIncrement} className="px-2.5 py-1.5 text-white hover:bg-success/80 transition-colors">
          <Plus size={12} strokeWidth={3} />
        </button>
      </div>
    );
  }

  // Non-cart actions: Book, Contact, Quote, etc.
  if (!isAvailable) {
    return <span className="text-[10px] font-medium text-muted-foreground shrink-0">Unavailable</span>;
  }

  return (
    <button
      onClick={onAdd}
      className="bg-primary text-primary-foreground font-bold text-xs px-3.5 py-1.5 rounded-full hover:bg-primary/90 transition-colors duration-200 shrink-0"
    >
      {buttonLabel}
    </button>
  );
}
