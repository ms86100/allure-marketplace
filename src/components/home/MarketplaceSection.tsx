import { useState, useMemo, useCallback } from 'react';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProductsByCategory } from '@/hooks/queries/useProductsByCategory';
import { useParentGroups } from '@/hooks/useParentGroups';
import { useSocialProof } from '@/hooks/queries/useSocialProof';
import { ParentGroupTabs } from '@/components/home/ParentGroupTabs';
import { CategoryImageGrid } from '@/components/home/CategoryImageGrid';
import { FeaturedBanners } from '@/components/home/FeaturedBanners';
import { AutoHighlightStrip } from '@/components/home/AutoHighlightStrip';
import { BuyAgainRow } from '@/components/home/BuyAgainRow';
import { ShopByStoreDiscovery } from '@/components/home/ShopByStoreDiscovery';
import { ProductListingCard, ProductWithSeller } from '@/components/product/ProductListingCard';
import { ProductDetailSheet } from '@/components/product/ProductDetailSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, ShoppingBag, Sparkles, Clock, TrendingUp, Flame, Store } from 'lucide-react';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { motion } from 'framer-motion';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useMarketplaceConfig } from '@/hooks/useMarketplaceConfig';
import { useBadgeConfig } from '@/hooks/useBadgeConfig';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/* ── Section spacer ── */
function SectionDivider() {
  return <div className="my-4" />;
}

export function MarketplaceSection() {
  const navigate = useNavigate();
  const { user, profile, effectiveSocietyId } = useAuth();
  const ml = useMarketplaceLabels();
  const { browsingLocation } = useBrowsingLocation();

  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { configs: categoryConfigs } = useCategoryConfigs();
  const mc = useMarketplaceConfig();
  const { badges: badgeConfigs } = useBadgeConfig();

  const { data: localCategories = [], isLoading: loadingLocal } = useProductsByCategory(80);
  const { parentGroupInfos } = useParentGroups();

  const { data: bannerCount = 0 } = useQuery({
    queryKey: ['featured-banner-count', effectiveSocietyId],
    queryFn: async () => {
      let query = supabase
        .from('featured_items')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      if (effectiveSocietyId) {
        query = query.or(`society_id.eq.${effectiveSocietyId},society_id.is.null`);
      } else {
        query = query.is('society_id', null);
      }
      const { count } = await query;
      return count || 0;
    },
    staleTime: 60_000,
  });

  const allProducts = useMemo(() => localCategories.flatMap(c => c.products), [localCategories]);
  const allProductIds = useMemo(() => allProducts.map(p => p.id), [allProducts]);
  const { data: socialProofMap } = useSocialProof(allProductIds);

  const newThisWeekDays = ml.threshold('new_this_week_days');
  const discoveryMinProducts = ml.threshold('discovery_min_products');
  const discoveryMaxItems = ml.threshold('discovery_max_items');

  const popularNearYou = useMemo(() => {
    return [...allProducts]
      .sort((a, b) => ((b as any).completed_order_count || 0) - ((a as any).completed_order_count || 0))
      .slice(0, discoveryMaxItems || 10);
  }, [allProducts, discoveryMaxItems]);

  const newThisWeek = useMemo(() => {
    const cutoff = Date.now() - (newThisWeekDays || 7) * 24 * 60 * 60 * 1000;
    const popularIds = new Set(popularNearYou.map(p => p.id));
    return allProducts
      .filter(p => new Date(p.created_at).getTime() >= cutoff && !popularIds.has(p.id))
      .slice(0, discoveryMaxItems || 10);
  }, [allProducts, newThisWeekDays, discoveryMaxItems, popularNearYou]);

  const filteredCategories = activeGroup
    ? localCategories.filter(cat => cat.parentGroup === activeGroup)
    : localCategories;

  const activeCategorySet = new Set(localCategories.map(c => c.category));
  const activeParentGroupSet = new Set(localCategories.map(c => c.parentGroup));

  const activeParentGroups = activeGroup
    ? parentGroupInfos.filter(g => g.value === activeGroup && activeParentGroupSet.has(g.value))
    : parentGroupInfos.filter(g => activeParentGroupSet.has(g.value));

  const handleProductTap = useCallback((product: ProductWithSeller) => {
    const catConfig = categoryConfigs.find(c => c.category === product.category);
    setSelectedProduct({
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      image_url: product.image_url,
      is_veg: product.is_veg,
      category: product.category,
      description: product.description,
      prep_time_minutes: product.prep_time_minutes,
      fulfillment_mode: product.fulfillment_mode,
      delivery_note: product.delivery_note,
      action_type: product.action_type,
      contact_phone: product.contact_phone,
      specifications: product.specifications || null,
      seller_id: product.seller_id,
      seller_name: product.seller_name || '',
      seller_rating: product.seller_rating || 0,
      seller_reviews: product.seller_reviews || 0,
      society_name: (product as any).society_name || null,
      distance_km: (product as any).distance_km ?? null,
      is_same_society: (product as any).is_same_society ?? true,
      last_active_at: (product as any).last_active_at ?? null,
      _catIcon: catConfig?.icon || '🛍️',
      _catName: catConfig?.displayName || product.category,
    });
    setDetailOpen(true);
  }, [categoryConfigs]);

  return (
    <div className="pb-2">
      {/* ── Hero: Featured Banners OR Auto-Highlights ── */}
      {bannerCount > 0 ? (
        <FeaturedBanners />
      ) : (
        <AutoHighlightStrip />
      )}

      {/* ── Icon-forward Category Tabs ── */}
      <div className="pt-4 pb-5">
        <ParentGroupTabs activeGroup={activeGroup} onGroupChange={setActiveGroup} activeParentGroups={activeParentGroupSet} />
      </div>

      {/* ── Frequently Bought ── */}
      {!activeGroup && <BuyAgainRow />}

      {/* ── Category Image Grids ── */}
      {activeParentGroups.map((group) => (
        <CategoryImageGrid
          key={group.value}
          parentGroup={group.value}
          title={group.label}
          activeCategories={activeCategorySet}
        />
      ))}

      {/* ── Discovery Rows ── */}
      {!activeGroup && popularNearYou.length > (discoveryMinProducts || 3) && (
        <>
          <SectionDivider />
          <DiscoveryRow
            title={browsingLocation?.label ? `${ml.label('label_discovery_popular')} · ${browsingLocation.label}` : ml.label('label_discovery_popular')}
            icon={<Flame size={15} className="text-destructive" />}
            accentClass="bg-destructive/10 text-destructive"
            products={popularNearYou}
            onProductTap={handleProductTap}
            onNavigate={navigate}
            categoryConfigs={categoryConfigs}
            marketplaceConfig={mc}
            badgeConfigs={badgeConfigs}
            socialProofMap={socialProofMap}
          />
        </>
      )}

      {!activeGroup && newThisWeek.length > 0 && (
        <>
          <SectionDivider />
          <DiscoveryRow
            title={ml.label('label_discovery_new')}
            icon={<Sparkles size={15} className="text-primary" />}
            accentClass="bg-primary/10 text-primary"
            products={newThisWeek}
            onProductTap={handleProductTap}
            onNavigate={navigate}
            categoryConfigs={categoryConfigs}
            marketplaceConfig={mc}
            badgeConfigs={badgeConfigs}
            socialProofMap={socialProofMap}
          />
        </>
      )}

      <SectionDivider />

      {/* ── Store Discovery ── */}
      <div className="py-6 mt-4">
        <div className="flex items-center gap-2 px-4 mb-3">
          <h3 className="font-extrabold text-lg text-foreground tracking-tight">{ml.label('label_section_store_discovery')}</h3>
        </div>
        <ShopByStoreDiscovery />
      </div>

      <ProductDetailSheet
        product={selectedProduct}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSelectProduct={(sp) => {
          const catConfig = categoryConfigs.find(c => c.category === sp.category);
          setSelectedProduct({
            product_id: sp.id,
            product_name: sp.name,
            price: sp.price,
            image_url: sp.image_url,
            is_veg: sp.is_veg ?? true,
            category: sp.category,
            description: sp.description || null,
            seller_id: sp.seller_id,
            seller_name: sp.seller?.business_name || '',
            seller_rating: 0,
            seller_reviews: 0,
            action_type: sp.action_type,
            _catIcon: catConfig?.icon || '🛍️',
            _catName: catConfig?.displayName || sp.category,
          });
        }}
        categoryIcon={selectedProduct?._catIcon}
        categoryName={selectedProduct?._catName}
      />
    </div>
  );
}

// ── Discovery Row ──
function DiscoveryRow({
  title, icon, accentClass, products, onProductTap, onNavigate, categoryConfigs, marketplaceConfig, badgeConfigs, socialProofMap,
}: {
  title: string;
  icon: React.ReactNode;
  accentClass?: string;
  products: ProductWithSeller[];
  onProductTap?: (p: ProductWithSeller) => void;
  onNavigate?: (path: string) => void;
  categoryConfigs?: any[];
  marketplaceConfig?: any;
  badgeConfigs?: any[];
  socialProofMap?: Map<string, number>;
}) {
  const heroIdx = useMemo(() => {
    const bsIdx = products.findIndex(p => p.is_bestseller);
    if (bsIdx >= 0) return bsIdx;
    if (products.length > 0) {
      let maxIdx = 0;
      let maxCount = (products[0] as any).completed_order_count || 0;
      for (let i = 1; i < products.length; i++) {
        const c = (products[i] as any).completed_order_count || 0;
        if (c > maxCount) { maxCount = c; maxIdx = i; }
      }
      return maxCount > 0 ? maxIdx : -1;
    }
    return -1;
  }, [products]);

  const firstProduct = products[0];
  const seeAllLink = firstProduct ? `/category/${(firstProduct as any).parentGroup || 'all'}` : null;

  return (
    <div>
      <div className="flex items-center justify-between px-4 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-extrabold text-lg text-foreground tracking-tight">{title}</h3>
        </div>
        {seeAllLink && (
          <Link to={seeAllLink} className="text-xs font-bold text-primary flex items-center gap-0.5 hover:underline">
            See all <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2 snap-x snap-mandatory">
        {products.map((product, i) => (
          <div key={product.id} className={cn('shrink-0 snap-start', i === heroIdx ? 'w-[220px]' : 'w-[160px]')}>
            <ProductListingCard
              product={product}
              onTap={onProductTap}
              onNavigate={onNavigate}
              categoryConfigs={categoryConfigs}
              marketplaceConfig={marketplaceConfig}
              badgeConfigs={badgeConfigs}
              socialProofCount={socialProofMap?.get(product.id)}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Category Product Grid (Blinkit-style themed category cards) ──
function ProductListings({
  categories, isLoading, onProductTap, onNavigate, categoryConfigs, marketplaceConfig, badgeConfigs, socialProofMap,
}: {
  categories: { category: string; parentGroup: string; displayName: string; icon: string; products: ProductWithSeller[] }[];
  isLoading: boolean;
  onProductTap?: (product: ProductWithSeller) => void;
  onNavigate?: (path: string) => void;
  categoryConfigs?: any[];
  marketplaceConfig?: any;
  badgeConfigs?: any[];
  socialProofMap?: Map<string, number>;
}) {
  const ml = useMarketplaceLabels();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="px-4 mt-4 grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative mb-8"
        >
          <div className="w-28 h-28 rounded-3xl bg-primary/10 flex items-center justify-center">
            <ShoppingBag size={48} className="text-primary" />
          </div>
          <div className="absolute -top-3 -right-3">
            <div className="w-10 h-10 rounded-2xl bg-warning/20 flex items-center justify-center">
              <Sparkles size={18} className="text-warning" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="space-y-3"
        >
          <h2 className="text-xl font-extrabold text-foreground tracking-tight">{ml.label('label_empty_marketplace_title')}</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            {ml.label('label_empty_marketplace_desc')}
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-8 flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-2xl px-5 py-3 shadow-card"
        >
          <Clock size={15} />
          <span>{ml.label('label_empty_marketplace_hint')}</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-4 mt-4">
      <div className="grid grid-cols-3 gap-3">
        {categories.map((cat) => {
          const catConfig = categoryConfigs?.find((c: any) => c.category === cat.category);
          const catColor = catConfig?.color || 'hsl(var(--primary))';
          const topProducts = cat.products.slice(0, 4);

          return (
            <button
              key={cat.category}
              type="button"
              onClick={() => navigate(`/category/${cat.parentGroup}?sub=${cat.category}`)}
              className="rounded-2xl border border-border/50 bg-card overflow-hidden text-left active:scale-[0.97] transition-transform flex flex-col"
              style={{
                background: `linear-gradient(160deg, ${catColor}18 0%, ${catColor}08 100%)`,
              }}
            >
              {/* Product image grid */}
              <div className="grid grid-cols-2 gap-0.5 p-2 flex-1">
                {topProducts.length > 0 ? (
                  topProducts.map((p) => (
                    <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-secondary/50">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <DynamicIcon name={cat.icon} size={20} className="text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 aspect-square flex items-center justify-center">
                    <DynamicIcon name={cat.icon} size={32} className="text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Category label */}
              <div className="px-2 pb-2.5 pt-0.5">
                <p className="text-[11px] font-bold text-foreground leading-tight line-clamp-2">
                  {cat.displayName}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {cat.products.length} item{cat.products.length !== 1 ? 's' : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
