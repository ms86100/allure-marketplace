import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useProductsByCategory } from '@/hooks/queries/useProductsByCategory';
import { Skeleton } from '@/components/ui/skeleton';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';
import { ChevronRight } from 'lucide-react';

interface CategoryImageGridProps {
  parentGroup: string;
  title: string;
  activeCategories?: Set<string>;
}

interface CategoryMeta {
  count: number;
  images: string[];
}

function buildCategoryMeta(
  productCategories: { category: string; products: any[] }[],
): Record<string, CategoryMeta> {
  const map: Record<string, CategoryMeta> = {};
  for (const pc of productCategories) {
    const products = pc.products ?? [];
    const images: string[] = [];
    for (const p of products) {
      if (p.image_url && images.length < 4) {
        images.push(p.image_url);
      }
    }
    map[pc.category] = { count: products.length, images };
  }
  return map;
}

function CategoryImageGridInner({ parentGroup, title, activeCategories }: CategoryImageGridProps) {
  const { groupedConfigs, isLoading } = useCategoryConfigs();
  const { data: productCategories = [], isLoading: productsLoading } = useProductsByCategory();
  const ml = useMarketplaceLabels();

  const allCategories = groupedConfigs[parentGroup] || [];
  // Only show categories that have actual products nearby (activeCategories gate)
  // AND have at least 1 real product in the metaMap
  const metaMap = useMemo(() => buildCategoryMeta(productCategories), [productCategories]);

  const categories = useMemo(() => {
    const filtered = activeCategories
      ? allCategories.filter(c => activeCategories.has(c.category))
      : allCategories;
    // CORE FIX: Hide categories with zero products — prevents clickable empty states
    return filtered.filter(c => {
      const meta = metaMap[c.category];
      return meta && meta.count > 0;
    });
  }, [allCategories, activeCategories, metaMap]);

  if (isLoading || productsLoading) {
    return (
      <div className="px-4 mb-6">
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) return null;

  return (
    <div className="mb-8 px-4">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-base text-foreground tracking-tight">{title}</h3>
        <Link
          to={`/category/${parentGroup}`}
          className="text-[11px] font-bold text-primary flex items-center gap-0.5"
        >
          See all <ChevronRight size={12} />
        </Link>
      </div>

      {/* 4-column tile grid — Blinkit style: dark card + 2×2 images + label below */}
      <div className="grid grid-cols-4 gap-x-3 gap-y-4 stagger-children">
        {categories.slice(0, 8).map((cat) => {
          const meta = metaMap[cat.category] || { count: 0, images: [] };
          const images = meta.images.length > 0
            ? meta.images
            : cat.imageUrl ? [cat.imageUrl] : [];

          return (
            <Link
              key={cat.category}
              to={`/category/${cat.parentGroup}?sub=${cat.category}`}
              className="flex flex-col items-center group active:scale-[0.96] transition-transform duration-150 card-hover"
            >
              {/* Dark card tile */}
              <div className="w-full aspect-square rounded-2xl overflow-hidden bg-card border border-border img-zoom relative">
                {images.length >= 4 ? (
                  <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-[2px] p-[2px]">
                    {images.slice(0, 4).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="w-full h-full object-cover rounded-lg"
                        loading="lazy"
                      />
                    ))}
                  </div>
                ) : images.length >= 2 ? (
                  <div className="grid grid-cols-2 w-full h-full gap-[2px] p-[2px]">
                    {images.slice(0, 2).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="w-full h-full object-cover rounded-lg"
                        loading="lazy"
                      />
                    ))}
                  </div>
                ) : images.length === 1 ? (
                  <img
                    src={images[0]}
                    alt={cat.displayName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <DynamicIcon
                      name={cat.icon}
                      size={32}
                      className="text-muted-foreground"
                    />
                  </div>
                )}
                {/* Count badge removed — was misleading when category page results diverged */}
              </div>

              {/* Label below card */}
              <span className="text-[11px] font-bold text-foreground text-center leading-tight mt-1.5 line-clamp-2 px-0.5">
                {cat.displayName}
              </span>

            </Link>
          );
        })}
      </div>
    </div>
  );
}

export const CategoryImageGrid = memo(CategoryImageGridInner);
