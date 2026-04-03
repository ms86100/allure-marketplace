import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { resolveProducts, ResolvedProduct } from '@/lib/bannerProductResolver';
import { optimizedImageUrl, handleImageError } from '@/utils/imageHelpers';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function FestivalCollectionPage() {
  const { bannerId, sectionId } = useParams<{ bannerId: string; sectionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch banner for theming
  const { data: banner } = useQuery({
    queryKey: ['festival-banner', bannerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('featured_items')
        .select('*')
        .eq('id', bannerId!)
        .single();
      return data;
    },
    enabled: !!bannerId,
    staleTime: 5 * 60_000,
  });

  // Fetch section details
  const { data: section } = useQuery({
    queryKey: ['banner-section', sectionId],
    queryFn: async () => {
      const { data } = await supabase
        .from('banner_sections')
        .select('*')
        .eq('id', sectionId!)
        .single();
      return data;
    },
    enabled: !!sectionId,
    staleTime: 5 * 60_000,
  });

  // Resolve products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['festival-collection-products', sectionId],
    queryFn: () => resolveProducts({
      sourceType: (section as any)?.product_source_type || 'category',
      sourceValue: (section as any)?.product_source_value,
      sectionId: sectionId!,
      fallbackMode: (banner as any)?.fallback_mode || 'hide',
      limit: 50,
    }),
    enabled: !!section,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });

  const themeConfig = (banner as any)?.theme_config || {};
  const gradient = themeConfig.gradient || [];
  const bgColor = themeConfig.bg || 'hsl(var(--primary))';

  const headerStyle = gradient.length >= 2
    ? { background: `linear-gradient(135deg, ${gradient.join(', ')})` }
    : { backgroundColor: bgColor };

  // Separate available vs out-of-stock
  const available = products.filter(p => p.is_available && (p.stock_quantity ?? 1) > 0);
  const outOfStock = products.filter(p => !p.is_available || (p.stock_quantity ?? 1) <= 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Themed Header */}
      <div className="relative" style={headerStyle}>
        <div className="flex items-center gap-3 px-4 pt-12 pb-5">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-extrabold text-lg">
              {(section as any)?.icon_emoji} {(section as any)?.title || 'Collection'}
            </h1>
            {(section as any)?.subtitle && (
              <p className="text-white/70 text-xs mt-0.5">{(section as any).subtitle}</p>
            )}
          </div>
          <span className="text-white/60 text-xs font-medium">
            {available.length} items
          </span>
        </div>
      </div>

      {/* Products Grid */}
      <div className="px-4 py-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : available.length === 0 && outOfStock.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag size={40} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">No products found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Check back later for new arrivals</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {available.map(product => (
                <ProductCard key={product.id} product={product} navigate={navigate} bannerId={bannerId!} sectionId={sectionId!} userId={user?.id} />
              ))}
            </div>

            {outOfStock.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground font-semibold mt-6 mb-2 uppercase tracking-wider">
                  Out of Stock
                </p>
                <div className="grid grid-cols-2 gap-3 opacity-50">
                  {outOfStock.map(product => (
                    <ProductCard key={product.id} product={product} navigate={navigate} bannerId={bannerId!} sectionId={sectionId!} userId={user?.id} outOfStock />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProductCard({
  product,
  navigate,
  bannerId,
  sectionId,
  userId,
  outOfStock = false,
}: {
  product: ResolvedProduct;
  navigate: any;
  bannerId: string;
  sectionId: string;
  userId?: string;
  outOfStock?: boolean;
}) {
  const lowStock = !outOfStock && product.stock_quantity != null && product.low_stock_threshold != null
    && product.stock_quantity <= product.low_stock_threshold && product.stock_quantity > 0;

  const discount = product.mrp && product.mrp > product.price
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0;

  const handleClick = () => {
    // Track product click (only if authenticated)
    if (userId) {
      supabase.from('banner_analytics').insert({
        banner_id: bannerId,
        section_id: sectionId,
        event_type: 'product_click',
        product_id: product.id,
        user_id: userId,
      }).then(() => {});
    }

    navigate(`/product/${product.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'rounded-2xl border border-border/40 bg-card overflow-hidden text-left transition-all',
        !outOfStock && 'active:scale-[0.97] hover:shadow-md'
      )}
    >
      <div className="relative aspect-square bg-muted">
        {product.image_url ? (
          <img
            src={optimizedImageUrl(product.image_url, { width: 300, quality: 75 })}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={handleImageError}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <ShoppingBag size={32} />
          </div>
        )}

        {outOfStock && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <Badge variant="secondary" className="text-[10px]">Out of Stock</Badge>
          </div>
        )}

        {lowStock && (
          <Badge className="absolute top-2 left-2 text-[9px] bg-warning text-white border-0 px-1.5 py-0.5">
            Only {product.stock_quantity} left
          </Badge>
        )}

        {discount > 0 && !outOfStock && (
          <Badge className="absolute top-2 right-2 text-[9px] bg-destructive text-white border-0 px-1.5 py-0.5">
            {discount}% off
          </Badge>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight">
          {product.name}
        </p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-sm font-bold text-foreground">₹{product.price}</span>
          {product.mrp && product.mrp > product.price && (
            <span className="text-[10px] text-muted-foreground line-through">₹{product.mrp}</span>
          )}
        </div>
      </div>
    </button>
  );
}
