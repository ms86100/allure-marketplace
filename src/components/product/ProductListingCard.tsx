import { useMemo, memo } from 'react';
import { Plus, Minus, Clock, MapPin, AlertTriangle, Users } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useHaptics } from '@/hooks/useHaptics';
import { Badge } from '@/components/ui/badge';
import { VegBadge } from '@/components/ui/veg-badge';
import { useCart } from '@/hooks/useCart';
import { ProductActionType } from '@/types/database';
import { NotifyMeButton } from './NotifyMeButton';
import { ACTION_CONFIG, deriveActionType } from '@/lib/marketplace-constants';
import { useCardAnalytics } from '@/hooks/useCardAnalytics';
import { MARKETPLACE_FALLBACKS, type MarketplaceConfig } from '@/hooks/useMarketplaceConfig';
import type { BadgeConfigRow } from '@/hooks/useBadgeConfig';
import type { CategoryConfig } from '@/types/categories';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';
import { computeStoreStatus, formatStoreClosedMessage, type StoreAvailability } from '@/lib/store-availability';
import { SellerTrustBadge } from '@/components/trust/SellerTrustBadge';

export interface ProductWithSeller {
  id: string; seller_id: string; name: string; price: number; image_url: string | null; category: string;
  is_veg: boolean; is_available: boolean; is_bestseller: boolean; is_recommended: boolean; is_urgent: boolean;
  description: string | null; action_type?: ProductActionType | string | null; contact_phone?: string | null;
  mrp?: number | null; brand?: string | null; unit_type?: string | null; price_per_unit?: string | null;
  stock_quantity?: number | null; serving_size?: string | null; spice_level?: string | null; cuisine_type?: string | null;
  service_scope?: string | null; visit_charge?: number | null; minimum_charge?: number | null;
  delivery_time_text?: string | null; tags?: string[] | null; discount_percentage?: number | null;
  service_duration_minutes?: number | null; prep_time_minutes?: number | null; warranty_period?: string | null;
  lead_time_hours?: number | null; accepts_preorders?: boolean;
  seller_name?: string; seller_rating?: number; seller_reviews?: number; seller_verified?: boolean;
  completed_order_count?: number; fulfillment_mode?: string | null; delivery_note?: string | null;
  seller_availability_start?: string | null; seller_availability_end?: string | null;
  seller_operating_days?: string[] | null; seller_is_available?: boolean;
  society_name?: string | null; distance_km?: number | null;
  created_at: string; updated_at: string; [key: string]: any;
}

type CardLayout = 'auto' | 'ecommerce' | 'food' | 'service';

interface ProductListingCardProps {
  product: ProductWithSeller; layout?: CardLayout; onTap?: (product: ProductWithSeller) => void;
  onNavigate?: (path: string) => void; className?: string; viewOnly?: boolean;
  categoryConfigs?: CategoryConfig[]; marketplaceConfig?: MarketplaceConfig;
  badgeConfigs?: BadgeConfigRow[]; socialProofCount?: number;
  onViewClick?: () => void;
  compact?: boolean;
}

function ProductListingCardInner({ product, layout = 'auto', onTap, onNavigate, className, viewOnly = false, categoryConfigs = [], marketplaceConfig, badgeConfigs = [], socialProofCount, onViewClick, compact = false }: ProductListingCardProps) {
  const { items, addItem, updateQuantity } = useCart();
  const { impact, selectionChanged } = useHaptics();
  const { formatPrice } = useCurrency();
  const ml = useMarketplaceLabels();
  const mc = marketplaceConfig || MARKETPLACE_FALLBACKS;

  const actionType: ProductActionType = useMemo(() => {
    const catTxType = categoryConfigs.find(c => c.category === product.category)?.transactionType;
    return deriveActionType(product.action_type as string, catTxType);
  }, [product.action_type, product.category, categoryConfigs]);
  const actionConfig = ACTION_CONFIG[actionType];
  const isCartAction = actionConfig.isCart;
  const cartItem = isCartAction ? items.find((item) => item.product_id === product.id) : null;
  const quantity = cartItem?.quantity || 0;

  const catConfig = useMemo(() => categoryConfigs.find(c => c.category === product.category) || null, [categoryConfigs, product.category]);
  const resolvedLayout = useMemo((): 'ecommerce' | 'food' | 'service' => { if (layout !== 'auto') return layout as any; return catConfig?.layoutType || 'ecommerce'; }, [layout, catConfig]);
  const showVegBadge = catConfig?.formHints?.showVegToggle ?? false;
  const placeholderEmoji = catConfig?.formHints?.placeholderEmoji || mc.labels.defaultPlaceholderEmoji;

  const { ref: cardRef, onCardClick: trackClick, onAddClick: trackAdd } = useCardAnalytics({ productId: product.id, category: product.category, price: product.price, sellerId: product.seller_id, layout: resolvedLayout });

  const handleAdd = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); trackAdd(); if (!isCartAction) { if (onTap) onTap(product); return; } addItem(product as any); };
  const handleIncrement = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); updateQuantity(product.id, quantity + 1); };
  const handleDecrement = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); updateQuantity(product.id, quantity - 1); };
  const handleCardClick = () => { selectionChanged(); trackClick(); if (onTap) onTap(product); else onNavigate?.(`/seller/${product.seller_id}`); };

  const isOutOfStock = !product.is_available;
  const isSellerInactive = useMemo(() => { if (!(product as any).last_active_at) return false; return Date.now() - new Date((product as any).last_active_at).getTime() > 7 * 24 * 60 * 60 * 1000; }, [(product as any).last_active_at]);

  const storeAvailability = useMemo((): StoreAvailability => computeStoreStatus(product.seller_availability_start, product.seller_availability_end, product.seller_operating_days, product.seller_is_available ?? true), [product.seller_availability_start, product.seller_availability_end, product.seller_operating_days, product.seller_is_available]);
  const isStoreClosed = storeAvailability.status !== 'open';
  const storeClosedMessage = isStoreClosed ? formatStoreClosedMessage(storeAvailability) : '';

  const isLowStock = mc.enableScarcity && product.stock_quantity != null && product.stock_quantity > 0 && product.stock_quantity <= mc.lowStockThreshold;

  const badges = useMemo(() => {
    const result: { label: string; color: string }[] = [];
    for (const bc of badgeConfigs) {
      if (result.length >= mc.maxBadgesPerCard) break;
      if (!bc.layout_visibility.includes(resolvedLayout)) continue;
      if (bc.tag_key === 'bestseller' && product.is_bestseller) result.push({ label: bc.badge_label, color: bc.color });
      else if (bc.tag_key === 'low_stock' && isLowStock) result.push({ label: bc.badge_label.replace('{stock}', String(product.stock_quantity)), color: mc.enablePulseAnimation ? `${bc.color} animate-low-stock-pulse` : bc.color });
      else if (product.tags?.includes(bc.tag_key) && bc.tag_key !== 'bestseller' && bc.tag_key !== 'low_stock') result.push({ label: bc.badge_label, color: bc.color });
    }
    return result;
  }, [badgeConfigs, product, resolvedLayout, isLowStock, mc]);

  const hasDiscount = product.mrp && product.mrp > product.price;
  const discountPct = product.discount_percentage || (hasDiscount ? Math.round(((product.mrp! - product.price) / product.mrp!) * 100) : 0);
  const deliveryText = product.delivery_time_text || (product.prep_time_minutes ? mc.labels.prepTimeFormat.replace('{value}', String(product.prep_time_minutes)) : null);
  const variantText = product.unit_type ? (product.price_per_unit || product.unit_type) : (product.serving_size || null);

  const distanceLabel = useMemo(() => {
    const distKm = product.distance_km ?? (product as any).distance_km;
    if (distKm != null) return distKm < 1 ? ml.label('label_distance_m_format').replace('{distance}', String(Math.round(distKm * 1000))) : ml.label('label_distance_km_format').replace('{distance}', String(Math.round(distKm * 10) / 10));
    return null;
  }, [product.distance_km, (product as any).distance_km, ml]);

  const locationLabel = useMemo(() => {
    const socName = product.society_name ?? (product as any).society_name;
    if (socName) return distanceLabel ? `${socName} · ${distanceLabel}` : socName;
    if (distanceLabel) return `${ml.label('label_nearby')} · ${distanceLabel}`;
    return null;
  }, [product.society_name, (product as any).society_name, distanceLabel]);

  const activityLabel = useMemo(() => { if (!(product as any).last_active_at) return ''; return formatSellerActivity((product as any).last_active_at, ml); }, [(product as any).last_active_at, ml]);
  const onTimeBadgeMinOrders = ml.threshold('on_time_badge_min_orders');

  const placeholderBg = catConfig?.color ? `${catConfig.color}10` : undefined;

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      className={cn(
        'bg-card rounded-2xl cursor-pointer flex flex-col h-full relative',
        'border border-border/70 shadow-card',
        'transition-all duration-150',
        'hover:shadow-elevated hover:border-border',
        'active:scale-[0.97]',
        isOutOfStock && 'opacity-40 grayscale-[50%]',
        isStoreClosed && !isOutOfStock && 'opacity-50 grayscale-[30%]',
        className
      )}
    >
      {/* Image */}
      <div className="relative">
        <div className="relative aspect-square rounded-t-2xl overflow-hidden product-image-bg">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: placeholderBg || 'hsl(var(--muted))' }}>
              <span className="text-3xl">{placeholderEmoji}</span>
            </div>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center backdrop-blur-[2px]">
              <span className="text-[10px] font-bold text-muted-foreground bg-card px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm">{mc.labels.outOfStock}</span>
            </div>
          )}

          {isStoreClosed && !isOutOfStock && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-[2px]">
              <span className="text-[10px] font-bold text-muted-foreground bg-card px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                <Clock size={10} />{storeClosedMessage}
              </span>
            </div>
          )}

          {/* Badges — top left */}
          {badges.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {badges.map((b, i) => (
                <Badge key={i} className={cn('text-[8px] leading-none px-2 py-0.5 font-bold rounded-full border-0 shadow-sm', b.color)}>{b.label}</Badge>
              ))}
            </div>
          )}

          {/* Discount — top right */}
          {hasDiscount && discountPct > 0 && (
            <div className="absolute top-2 right-2">
              <span className="bg-primary text-primary-foreground text-[9px] font-bold px-2 py-1 rounded-full shadow-sm">{discountPct}% OFF</span>
            </div>
          )}

          {showVegBadge && (
            <div className="absolute bottom-2 right-2">
              <VegBadge isVeg={product.is_veg} size="sm" />
            </div>
          )}
        </div>

        {/* Add button — overlapping image bottom */}
        {!viewOnly && !isOutOfStock && !isStoreClosed && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-10">
            {isCartAction && quantity > 0 ? (
              <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-cta animate-stepper-pop">
                <button onClick={handleDecrement} className="px-3.5 py-2 text-primary-foreground hover:bg-primary/80 transition-colors min-w-[42px] min-h-[36px] flex items-center justify-center">
                  <Minus size={13} strokeWidth={3} />
                </button>
                <span className="font-bold text-sm text-primary-foreground px-2 tabular-nums">{quantity}</span>
                <button onClick={handleIncrement} className="px-3.5 py-2 text-primary-foreground hover:bg-primary/80 transition-colors min-w-[42px] min-h-[36px] flex items-center justify-center">
                  <Plus size={13} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleAdd}
                className="bg-card text-primary font-bold text-xs px-6 py-2 rounded-xl border-2 border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all duration-200 uppercase tracking-wide active:scale-95 min-h-[36px] shadow-card"
              >
                {actionConfig.shortLabel}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn(
        "flex flex-col flex-1",
        compact ? "px-2.5 pb-2.5" : "px-3 pb-3",
        !viewOnly && !isOutOfStock ? "pt-6" : "pt-3"
      )}>
        {variantText && (
          <span className="text-[10px] font-medium text-muted-foreground mb-0.5">{variantText}</span>
        )}

        <h4 className={cn("font-semibold leading-snug text-foreground", compact ? "text-[12px] line-clamp-1" : "text-[13px] line-clamp-2")}>{product.name}</h4>

        {product.seller_name && !compact && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground truncate">{product.seller_name}</span>
            {product.seller_id && <SellerTrustBadge sellerId={product.seller_id} size="sm" />}
            {activityLabel && <span className="text-[9px] text-muted-foreground/70">· {activityLabel}</span>}
            {isSellerInactive && (
              <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-warning bg-warning/10 rounded-full px-1.5 py-0.5">
                <AlertTriangle size={8} />Inactive
              </span>
            )}
          </div>
        )}

        {!compact && (product as any).on_time_delivery_pct != null && (product as any).completed_order_count > onTimeBadgeMinOrders && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-primary bg-primary/8 rounded-full px-2 py-0.5 w-fit mt-1.5">
            {ml.label('label_on_time_format').replace('{pct}', String((product as any).on_time_delivery_pct))}
          </span>
        )}

        {!compact && socialProofCount != null && socialProofCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-muted-foreground bg-secondary rounded-full px-2 py-0.5 w-fit mt-1">
            <Users size={9} className="shrink-0" />
            {ml.label('label_social_proof_format').replace('{count}', String(socialProofCount)).replace('{unit}', socialProofCount === 1 ? ml.label('label_social_proof_singular') : ml.label('label_social_proof_plural'))}
          </span>
        )}

        {!compact && deliveryText && (
          <div className="flex items-center gap-1 mt-1.5">
            <Clock size={10} className="text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">{deliveryText}</span>
          </div>
        )}

        {!compact && product.lead_time_hours != null && product.lead_time_hours > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Clock size={9} className="text-muted-foreground" />
            <span className="text-[9px] font-medium text-muted-foreground">Order {product.lead_time_hours}h ahead</span>
          </div>
        )}

        {!compact && product.accepts_preorders && (
          <span className="inline-block bg-primary/8 text-primary text-[8px] font-bold px-2 py-0.5 rounded-full w-fit mt-1">Pre-order</span>
        )}

        <div className="flex-1 min-h-0" />

        {/* Price row */}
        <div className="flex items-end gap-2 mt-2">
          <span className="font-bold text-[15px] text-foreground leading-none tracking-tight tabular-nums">{formatPrice(product.price)}</span>
          {hasDiscount && (
            <span className="text-[11px] text-muted-foreground line-through leading-none tabular-nums">{formatPrice(product.mrp!)}</span>
          )}
        </div>

        {!compact && product.price_per_unit && (
          <span className="text-[10px] text-muted-foreground leading-none mt-0.5">{product.price_per_unit}</span>
        )}

        {!compact && (locationLabel || (product as any).is_same_society !== false) && (
          <div
            className={cn("flex items-center gap-1 mt-1.5", (product as any).seller_latitude && (product as any).seller_longitude && "cursor-pointer hover:text-primary transition-colors")}
            onClick={(e) => {
              const lat = (product as any).seller_latitude;
              const lng = (product as any).seller_longitude;
              if (lat && lng) {
                e.stopPropagation();
                e.preventDefault();
                window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
              }
            }}
            title={(product as any).seller_latitude ? "Open in Google Maps" : undefined}
          >
            <MapPin size={10} className="shrink-0 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground leading-tight truncate">
              {locationLabel || ml.label('label_in_your_society')}
            </span>
          </div>
        )}
      </div>

      {viewOnly && (
        <div className="px-3 pb-3">
          <button
            onClick={(e) => { e.stopPropagation(); if (onViewClick) { onViewClick(); } else { onNavigate?.(`/seller/${product.seller_id}`); } }}
            className="w-full border-2 border-primary text-primary font-bold text-xs py-2.5 rounded-xl hover:bg-primary hover:text-primary-foreground transition-all duration-200"
          >
            {onViewClick ? 'View Details' : mc.labels.viewButton}
          </button>
        </div>
      )}

      {!viewOnly && isOutOfStock && (<NotifyMeButton productId={product.id} />)}
    </div>
  );
}

function formatSellerActivity(lastActiveAt: string, ml: ReturnType<typeof useMarketplaceLabels>): string {
  try {
    const d = new Date(lastActiveAt);
    if (isNaN(d.getTime())) return '';
    return ml.label('label_active_ago').replace('{time}', formatDistanceToNowStrict(d, { addSuffix: false }));
  } catch {
    return '';
  }
}

export const ProductListingCard = memo(ProductListingCardInner);
