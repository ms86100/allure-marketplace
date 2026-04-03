import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { optimizedImageUrl, handleImageError } from '@/utils/imageHelpers'; // used by DiscoveryRow via ProductListingCard
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
import { getCategoryPastel } from '@/lib/category-pastels';
import { ProductDetailSheet } from '@/components/product/ProductDetailSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, ShoppingBag, Sparkles, Clock, TrendingUp, Flame, Store, UtensilsCrossed, Wrench, Heart, Users } from 'lucide-react';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { motion } from 'framer-motion';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useMarketplaceConfig } from '@/hooks/useMarketplaceConfig';
import { useBadgeConfig } from '@/hooks/useBadgeConfig';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';
import { cn } from '@/lib/utils';

/* ── Fade-in wrapper for progressive reveal ── */
function FadeIn({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

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

  const allProducts = useMemo(() => localCategories.flatMap(c => c.products), [localCategories]);
  const allProductIds = useMemo(() => allProducts.map(p => p.id), [allProducts]);

  // Perf: Defer social proof — not above-fold critical, depends on all product IDs
  const [socialProofReady, setSocialProofReady] = useState(false);
  useEffect(() => {
    if (allProductIds.length === 0) return;
    const timer = setTimeout(() => setSocialProofReady(true), 2000);
    return () => clearTimeout(timer);
  }, [allProductIds.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: socialProofMap } = useSocialProof(socialProofReady ? allProductIds : []);

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

  // ── Empty marketplace: show engaging onboarding state ──
  if (!loadingLocal && localCategories.length === 0) {
    return (
      <div className="pb-2 section-reveal">
        <FadeIn>
          <FeaturedBanners />
        </FadeIn>
        <div className="px-4 py-10 space-y-8">
          {/* Hero visual */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            <div className="relative mb-6">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full bg-primary/20"
              />
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0, 0.2] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className="absolute inset-0 rounded-full bg-primary/10"
              />
              <div className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <ShoppingBag size={40} className="text-primary" />
              </div>
              <motion.div
                animate={{ y: [-4, 4, -4] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-warning/20 flex items-center justify-center"
              >
                <UtensilsCrossed size={14} className="text-warning" />
              </motion.div>
              <motion.div
                animate={{ y: [4, -4, 4] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                className="absolute -bottom-1 -left-3 w-8 h-8 rounded-xl bg-accent/20 flex items-center justify-center"
              >
                <Wrench size={14} className="text-accent-foreground" />
              </motion.div>
            </div>

            <h2 className="text-xl font-extrabold text-foreground tracking-tight">{ml.label('label_empty_marketplace_title')}</h2>
            <p className="text-sm text-muted-foreground max-w-xs mt-2 leading-relaxed">
              {ml.label('label_empty_marketplace_desc')}
            </p>
          </motion.div>

          {/* Value proposition cards */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: <UtensilsCrossed size={20} className="text-warning" />, bg: 'bg-warning/10', title: 'Home-cooked meals', desc: 'Fresh food from your neighbors' },
              { icon: <Wrench size={20} className="text-primary" />, bg: 'bg-primary/10', title: 'Local services', desc: 'Trusted help nearby' },
              { icon: <Heart size={20} className="text-destructive" />, bg: 'bg-destructive/10', title: 'Zero commission', desc: 'Sellers keep 100%' },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.12, duration: 0.4 }}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border text-center"
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', card.bg)}>
                  {card.icon}
                </div>
                <p className="text-[11px] font-bold text-foreground leading-tight">{card.title}</p>
                <p className="text-[9px] text-muted-foreground leading-snug">{card.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* How it works */}
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="rounded-2xl bg-secondary/50 border border-border p-4 space-y-3"
          >
            <p className="text-xs font-bold text-foreground text-center">How it works</p>
            <div className="flex items-start gap-3">
              {[
                { step: '1', text: 'Sellers list their products & services' },
                { step: '2', text: 'You browse, compare & order' },
                { step: '3', text: 'Get it delivered from your neighbor' },
              ].map((s) => (
                <div key={s.step} className="flex-1 flex flex-col items-center gap-1.5 text-center">
                  <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {s.step}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">{s.text}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.4 }}
            className="flex items-center justify-center gap-2 text-xs text-muted-foreground"
          >
            <Users size={14} />
            <span>Join families already using Sociva in their community</span>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1, duration: 0.4 }}
            className="flex flex-col gap-2 max-w-xs mx-auto"
          >
            <button
              onClick={() => navigate('/become-seller')}
              className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              🛍️ Start selling to your neighbors
            </button>
            <button
              onClick={() => {
                const shareData = { title: 'Join our community marketplace', url: window.location.origin };
                if (navigator.share) {
                  navigator.share(shareData).catch(() => {});
                } else {
                  navigator.clipboard.writeText(shareData.url).then(() => {
                    toast.success('Link copied!', { description: 'Share it with your neighbor to get them selling' });
                  });
                }
              }}
              className="w-full px-4 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium active:scale-[0.98] transition-transform"
            >
              📨 Invite a neighbor to sell
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-2 section-reveal">
      {/* ── P1: Featured Banners — independent, renders its own skeleton ── */}
      <FadeIn>
        <FeaturedBanners />
      </FadeIn>

      {/* ── P1: Auto-Highlights — independent ── */}
      <FadeIn delay={0.05}>
        <AutoHighlightStrip />
      </FadeIn>

      {/* ── P1: Icon-forward Category Tabs — renders own skeleton ── */}
      <FadeIn delay={0.1}>
        <div className="pt-4 pb-5">
          <ParentGroupTabs activeGroup={activeGroup} onGroupChange={setActiveGroup} activeParentGroups={activeParentGroupSet} />
        </div>
      </FadeIn>

      {/* ── P2: Category Image Grids — each group independent ── */}
      {loadingLocal ? (
        <div className="px-4 mt-2">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Frequently Bought */}
          {!activeGroup && (
            <FadeIn delay={0.15}>
              <BuyAgainRow />
            </FadeIn>
          )}

          {activeParentGroups.map((group, i) => (
            <FadeIn key={group.value} delay={0.15 + i * 0.05}>
              <CategoryImageGrid
                parentGroup={group.value}
                title={group.label}
                activeCategories={activeCategorySet}
              />
            </FadeIn>
          ))}
        </>
      )}

      {/* ── P2-P3: Discovery Rows ── */}
      {!activeGroup && popularNearYou.length > (discoveryMinProducts || 3) && (
        <FadeIn delay={0.3}>
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
        </FadeIn>
      )}

      {!activeGroup && newThisWeek.length > 0 && (
        <FadeIn delay={0.35}>
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
        </FadeIn>
      )}

      <SectionDivider />

      {/* ── P3: Store Discovery (heading rendered internally) ── */}
      <FadeIn delay={0.4}>
        <ShopByStoreDiscovery sectionTitle={ml.label('label_section_store_discovery')} />
      </FadeIn>

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
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2 snap-x snap-mandatory stagger-children items-stretch">
        {products.map((product, i) => (
          <div key={product.id} className="shrink-0 snap-start card-hover w-[160px] flex">
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


