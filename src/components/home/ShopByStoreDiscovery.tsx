import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useLocalSellers,
  useNearbySocietySellers,
  type LocalSeller,
  type NearbySeller,
  type DistanceBand,
  type SocietyGroup,
  type TopProduct,
} from '@/hooks/queries/useStoreDiscovery';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Store, MapPin, ChevronDown, Building2, Users, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { VegBadge } from '@/components/ui/veg-badge';

/* ── Helpers ── */

function sanitizeSellerName(name: string): string {
  return /^\d+$/.test(name.trim()) ? '' : name;
}

function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/* ── Main Component ── */

export function ShopByStoreDiscovery() {
  const { effectiveSociety, profile } = useAuth();
  const browseBeyond = profile?.browse_beyond_community ?? true;
  const radiusKm = profile?.search_radius_km ?? 10;
  const { data: localGrouped = {}, isLoading: loadingLocal } = useLocalSellers();
  const { data: nearbyBands = [], isLoading: loadingNearby } = useNearbySocietySellers(radiusKm, browseBeyond);

  // Collect local seller IDs for deduplication
  const localSellerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sellers of Object.values(localGrouped)) {
      for (const s of sellers) ids.add(s.id);
    }
    return ids;
  }, [localGrouped]);

  // Filter nearby bands to remove sellers already shown in local section
  const dedupedBands = useMemo(() => {
    if (localSellerIds.size === 0) return nearbyBands;
    return nearbyBands.map(band => ({
      ...band,
      societies: band.societies.map(society => {
        const filteredGroups: Record<string, NearbySeller[]> = {};
        for (const [group, sellers] of Object.entries(society.sellersByGroup)) {
          const filtered = sellers.filter(s => !localSellerIds.has(s.seller_id));
          if (filtered.length > 0) filteredGroups[group] = filtered;
        }
        return { ...society, sellersByGroup: filteredGroups };
      }).filter(society => Object.keys(society.sellersByGroup).length > 0),
    })).filter(band => band.societies.length > 0);
  }, [nearbyBands, localSellerIds]);

  const hasLocal = Object.keys(localGrouped).length > 0;
  const hasNearby = dedupedBands.length > 0;

  if (!loadingLocal && !loadingNearby && !hasLocal && !hasNearby) return null;

  const localSectionLabel = effectiveSociety ? 'In Your Society' : 'Stores Near You';

  return (
    <div className="space-y-5">
      {/* ━━━ In Your Society / Stores Near You ━━━ */}
      {(loadingLocal || hasLocal) && (
        <section>
          <div className="flex items-center gap-2 px-4 mb-2.5">
            <Building2 size={16} className="text-primary" />
            <h3 className="font-bold text-sm text-foreground">
              {localSectionLabel}
              {effectiveSociety?.name && (
                <span className="font-normal text-muted-foreground ml-1">
                  – {effectiveSociety.name}
                </span>
              )}
            </h3>
          </div>

          {loadingLocal ? (
            <LocalSkeleton />
          ) : (
            <div className="space-y-3">
              {Object.entries(localGrouped).map(([group, sellers]) => (
                <CategorySellerRow key={group} groupLabel={group} sellers={sellers} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ━━━ Nearby Societies ━━━ */}
      {(loadingNearby || hasNearby) && (
        <section>
          <div className="flex items-center gap-2 px-4 mb-2.5">
            <MapPin size={16} className="text-primary" />
            <h3 className="font-bold text-sm text-foreground">Nearby Societies</h3>
          </div>

          {loadingNearby ? (
            <NearbySkeleton />
          ) : (
            <div className="space-y-3">
              {dedupedBands.map(band => (
                <DistanceBandSection key={band.label} band={band} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ── Distance Band (collapsible) ── */

function DistanceBandSection({ band }: { band: DistanceBand }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 px-4 w-full text-left">
        <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
          {band.label}
        </span>
        <ChevronDown
          size={14}
          className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2.5 mt-2">
        {band.societies.map(society => (
          <SocietyCard key={society.societyName} society={society} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Format distance ── */

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km * 10) / 10} km`;
}

/* ── Society Card ── */

function SocietyCard({ society }: { society: SocietyGroup }) {
  const allSellers = Object.entries(society.sellersByGroup).flatMap(([, sellers]) => sellers);

  return (
    <div className="mx-4 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-3 py-2.5 bg-secondary flex items-center justify-between">
        <span className="text-xs font-bold text-foreground">{society.societyName}</span>
        <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {formatDistance(society.distanceKm)}
        </span>
      </div>
      <div className="p-2">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
          {allSellers.map(seller => (
            <RichSellerCard
              key={seller.seller_id}
              id={seller.seller_id}
              name={seller.business_name}
              profileImage={seller.profile_image_url}
              coverImage={seller.cover_image_url}
              categories={seller.categories}
              topProducts={seller.topProducts}
              totalReviews={seller.total_reviews}
              isFeatured={seller.is_featured}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Category Seller Row (local sellers) ── */

function CategorySellerRow({
  groupLabel,
  sellers,
}: {
  groupLabel: string;
  sellers: LocalSeller[];
}) {
  return (
    <div>
      <div className="px-4 mb-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full capitalize">
          {groupLabel.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 pb-1">
        {sellers.map(seller => (
          <RichSellerCard
            key={seller.id}
            id={seller.id}
            name={seller.business_name}
            profileImage={seller.profile_image_url}
            coverImage={seller.cover_image_url}
            categories={seller.categories}
            topProducts={seller.topProducts}
            totalReviews={seller.total_reviews}
            isFeatured={seller.is_featured}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Rich Seller Card ── */

interface RichSellerCardProps {
  id: string;
  name: string;
  profileImage: string | null;
  coverImage: string | null;
  categories: string[] | null;
  topProducts: TopProduct[];
  totalReviews: number;
  isFeatured: boolean;
  compact?: boolean;
}

function RichSellerCard({
  id,
  name,
  profileImage,
  coverImage,
  categories,
  topProducts,
  totalReviews,
  isFeatured,
  compact = false,
}: RichSellerCardProps) {
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const sanitized = sanitizeSellerName(name);
  const hue = useMemo(() => hashToHue(id), [id]);

  const hasProducts = topProducts.length > 0;
  const minPrice = hasProducts ? Math.min(...topProducts.map(p => p.price)) : null;
  const heroImage = coverImage || (hasProducts ? topProducts[0]?.image_url : null) || profileImage;
  const isNew = totalReviews === 0;
  const cardWidth = compact ? 'w-[140px]' : 'w-[156px]';

  return (
    <div
      onClick={() => navigate(`/seller/${id}`)}
      className={cn(
        'shrink-0 rounded-2xl overflow-hidden cursor-pointer',
        'bg-card border border-border',
        'transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.97]',
        cardWidth,
      )}
    >
      {/* Hero image / fallback avatar */}
      <div className="relative h-20 bg-muted overflow-hidden">
        {heroImage ? (
          <img
            src={heroImage}
            alt={sanitized}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
          >
            {sanitized.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Featured badge */}
        {isFeatured && (
          <span className="absolute top-1.5 left-1.5 text-[8px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">
            Trusted
          </span>
        )}

        {/* Social proof */}
        <span className="absolute bottom-1 right-1 text-[8px] font-semibold bg-background/80 backdrop-blur-sm text-foreground px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          {isNew ? (
            <>
              <Store size={8} />
              New
            </>
          ) : (
            <>
              <Users size={8} />
              {totalReviews} reviews
            </>
          )}
        </span>
      </div>

      {/* Seller info */}
      <div className="px-2 pt-1.5 pb-1">
        <p className="font-bold text-foreground text-[11px] leading-tight line-clamp-1">
          {sanitized}
        </p>

        {/* Category chips */}
        {categories && categories.length > 0 && (
          <div className="flex gap-1 mt-1 overflow-hidden">
            {categories.slice(0, 2).map(cat => (
              <span
                key={cat}
                className="text-[8px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground truncate max-w-[60px]"
              >
                {cat.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Top Products strip */}
      {hasProducts && (
        <div className="px-1.5 pb-2">
          <div className="flex gap-1">
            {topProducts.slice(0, 2).map((product) => (
              <ProductMini key={product.id} product={product} />
            ))}
          </div>

          {/* Starting price */}
          {minPrice !== null && (
            <p className="text-[9px] font-semibold text-success mt-1 px-0.5">
              From {formatPrice(minPrice)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Product mini thumbnail ── */

function ProductMini({ product }: { product: TopProduct }) {
  const { formatPrice } = useCurrency();

  return (
    <div className="flex-1 min-w-0 rounded-lg bg-muted/50 overflow-hidden">
      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-12 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-12 flex items-center justify-center bg-secondary">
          <ShoppingBag size={14} className="text-muted-foreground" />
        </div>
      )}
      <div className="px-1 py-0.5">
        <p className="text-[8px] text-foreground font-medium line-clamp-1">{product.name}</p>
        <div className="flex items-center gap-0.5">
          {product.is_veg !== null && <VegBadge isVeg={product.is_veg} size="sm" />}
          <span className="text-[8px] font-bold text-foreground">{formatPrice(product.price)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Skeletons ── */

function LocalSkeleton() {
  return (
    <div className="px-4 space-y-3">
      {[1, 2].map(i => (
        <div key={i}>
          <Skeleton className="h-4 w-16 mb-2 rounded-full" />
          <div className="flex gap-2.5">
            {[1, 2, 3].map(j => (
              <Skeleton key={j} className="w-[156px] h-44 rounded-2xl shrink-0" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NearbySkeleton() {
  return (
    <div className="px-4 space-y-3">
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  );
}
