import { useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProductCarousel } from '@/components/product/ProductCarousel';
import { ProductGridCard, ProductWithSeller } from '@/components/product/ProductGridCard';
import { SellerCard } from '@/components/seller/SellerCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useParentGroups } from '@/hooks/useParentGroups';
import { useCategoryProducts } from '@/hooks/queries/usePopularProducts';
import { ServiceCategory, CategoryConfig } from '@/types/categories';
import { SellerProfile } from '@/types/database';
import { ArrowLeft, Search, Grid3X3, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function CategoryGroupPage() {
  const { category } = useParams<{ category: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const subCategory = searchParams.get('sub') as ServiceCategory | null;

  const { effectiveSocietyId } = useAuth();
  const { groupedConfigs, configs, isLoading: configsLoading } = useCategoryConfigs();
  const { getGroupBySlug, isLoading: groupsLoading } = useParentGroups();
  const [activeSubCategory, setActiveSubCategory] = useState<ServiceCategory | null>(subCategory);

  const parentGroup = category ? getGroupBySlug(category) : undefined;
  const subCategories = category ? groupedConfigs[category] || [] : [];

  // Fetch products for this parent group
  const { data: allProducts = [], isLoading: productsLoading } = useCategoryProducts(
    category || null,
    effectiveSocietyId
  );

  // Fetch top sellers for bottom section
  const { data: topSellers = [] } = useQuery({
    queryKey: ['category-sellers', category, effectiveSocietyId],
    queryFn: async () => {
      let query = supabase
        .from('seller_profiles')
        .select(`*, profile:profiles!seller_profiles_user_id_fkey(name, block)`)
        .eq('verification_status', 'approved')
        .eq('primary_group', category!)
        .order('rating', { ascending: false })
        .limit(10);

      if (effectiveSocietyId) {
        query = query.eq('society_id', effectiveSocietyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!category,
  });

  // Group products by sub-category
  const productsByCategory = useMemo(() => {
    const grouped: Record<string, ProductWithSeller[]> = {};
    allProducts.forEach((product) => {
      const cat = product.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(product);
    });
    return grouped;
  }, [allProducts]);

  // Get behavior for a specific sub-category
  const getBehavior = (cat: string) => {
    const config = configs.find((c) => c.category === cat);
    return config?.behavior || null;
  };

  // Get config for display info
  const getConfig = (cat: string): CategoryConfig | undefined => {
    return configs.find((c) => c.category === cat);
  };

  // Filter products when a sub-category tab is selected
  const filteredProducts = activeSubCategory
    ? productsByCategory[activeSubCategory] || []
    : null;

  const handleSubCategorySelect = (cat: ServiceCategory | null) => {
    setActiveSubCategory(cat);
    if (cat) {
      setSearchParams({ sub: cat });
    } else {
      setSearchParams({});
    }
  };

  const isLoading = groupsLoading || configsLoading;

  if (isLoading) {
    return (
      <AppLayout showHeader={false}>
        <div className="p-4">
          <Skeleton className="h-16 w-full rounded-xl mb-4" />
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!parentGroup) {
    return (
      <AppLayout showHeader={false}>
        <div className="p-4 text-center">
          <p>Category not found</p>
          <Link to="/">
            <Button className="mt-4">Go Home</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showHeader={false}>
      {/* Header */}
      <div className={cn('p-4 pb-2', parentGroup.color.split(' ')[0])}>
        <div className="flex items-center gap-3 mb-3">
          <Link to="/" className="w-10 h-10 rounded-full bg-background/90 flex items-center justify-center shadow-sm">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="text-2xl">{parentGroup.icon}</span>
              {parentGroup.label}
            </h1>
            <p className="text-sm text-muted-foreground">{parentGroup.description}</p>
          </div>
          <Link to="/search" className="w-10 h-10 rounded-full bg-background/90 flex items-center justify-center shadow-sm">
            <Search size={18} />
          </Link>
        </div>

        {/* Sub-category tabs */}
        {subCategories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
            <button
              onClick={() => handleSubCategorySelect(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                !activeSubCategory ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
              )}
            >
              All
            </button>
            {subCategories.map((config) => (
              <button
                key={config.category}
                onClick={() => handleSubCategorySelect(config.category)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1',
                  activeSubCategory === config.category ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
                )}
              >
                <span>{config.icon}</span>
                {config.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="pb-6">
        {productsLoading ? (
          <div className="p-4 grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : activeSubCategory ? (
          /* Grid view when a sub-category is selected */
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-3">
              {filteredProducts?.length || 0} item{(filteredProducts?.length || 0) !== 1 ? 's' : ''}
            </p>
            {filteredProducts && filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => (
                  <ProductGridCard
                    key={product.id}
                    product={product}
                    behavior={getBehavior(product.category)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">{parentGroup.icon}</div>
                <h3 className="font-semibold mb-2">No items yet</h3>
                <p className="text-sm text-muted-foreground">
                  Check back soon for new listings!
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Carousel view when "All" is selected */
          <>
            {/* Product count */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-sm text-muted-foreground">
                {allProducts.length} item{allProducts.length !== 1 ? 's' : ''} available
              </p>
            </div>

            {/* Carousels per sub-category */}
            {subCategories.map((config) => {
              const products = productsByCategory[config.category] || [];
              if (products.length === 0) return null;

              return (
                <div key={config.category} className="mt-4">
                  <ProductCarousel
                    title={config.displayName}
                    emoji={config.icon}
                    itemCount={products.length}
                    products={products}
                    behavior={config.behavior}
                    onSeeAll={() => handleSubCategorySelect(config.category)}
                    variant="compact"
                  />
                </div>
              );
            })}

            {/* Show ungrouped products (products whose category doesn't match any sub-category) */}
            {(() => {
              const knownCategories = new Set(subCategories.map((c) => c.category));
              const ungrouped = allProducts.filter((p) => !knownCategories.has(p.category));
              if (ungrouped.length === 0) return null;
              return (
                <div className="mt-4">
                  <ProductCarousel
                    title="Other"
                    products={ungrouped}
                    variant="compact"
                  />
                </div>
              );
            })()}

            {/* Empty state */}
            {allProducts.length === 0 && (
              <div className="text-center py-12 px-4">
                <div className="text-4xl mb-4">{parentGroup.icon}</div>
                <h3 className="font-semibold mb-2">No items yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Be the first to offer {parentGroup.label.toLowerCase()} in your community!
                </p>
                <Link to="/become-seller">
                  <Button>Become a Seller</Button>
                </Link>
              </div>
            )}

            {/* Top Sellers section */}
            {topSellers.length > 0 && (
              <div className="mt-6 px-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">⭐</span>
                  <h3 className="font-semibold text-sm">
                    Top Sellers in {parentGroup.label}
                  </h3>
                </div>
                <div className="space-y-3">
                  {topSellers.slice(0, 5).map((seller: any) => (
                    <SellerCard key={seller.id} seller={seller} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
