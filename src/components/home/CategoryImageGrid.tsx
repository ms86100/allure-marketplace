import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useProductsByCategory } from '@/hooks/queries/useProductsByCategory';
import { Skeleton } from '@/components/ui/skeleton';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';
import { ChevronRight } from 'lucide-react';
import { getCategoryPastel } from '@/lib/category-pastels';

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
  const metaMap = useMemo(() => buildCategoryMeta(productCategories), [productCategories]);

  const categories = useMemo(() => {
    const filtered = activeCategories
      ? allCategories.filter(c => activeCategories.has(c.category))
      : allCategories;
    return filtered.filter(c => {
      const meta = metaMap[c.category];
      return meta && meta.count > 0;
    });
  }, [allCategories, activeCategories, metaMap]);

  if (isLoading || productsLoading) {
    return (
      <div className="px-4 mb-6">
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="w-full rounded-2xl h-28" />
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

      {/* 3-column tile grid — Blinkit style: pastel card + 2 images + label */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 stagger-children">
        {categories.slice(0, 9).map((cat) => {
          const meta = metaMap[cat.category] || { count: 0, images: [] };
          const images = meta.images.length > 0
            ? meta.images
            : cat.imageUrl ? [cat.imageUrl] : [];
          const isFoodBev = parentGroup === 'food_beverages';
          const cardBg = isFoodBev ? '#096161' : getCategoryPastel(cat.category, cat.color);
          const labelColor = isFoodBev ? 'text-white' : 'text-gray-900';

          return (
            <Link
              key={cat.category}
              to={`/category/${cat.parentGroup}?sub=${cat.category}`}
              className="flex flex-col items-center group active:scale-[0.96] transition-transform duration-150"
            >
              {/* Pastel card tile */}
                <div
                 className="w-full rounded-2xl overflow-hidden relative p-3 shadow-sm border border-black/[0.04]"
                 style={{ backgroundColor: cardBg }}
               >
                {/* Image area */}
                <div className="relative aspect-[4/3]">
                  {images.length >= 2 ? (
                    <div className="grid grid-cols-2 gap-1.5 h-full">
                      {images.slice(0, 2).map((src, i) => (
                        <div key={i} className="relative w-full h-full overflow-hidden rounded-2xl">
                          <img
                            src={src}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  ) : images.length === 1 ? (
                    <img
                      src={images[0]}
                      alt={cat.displayName}
                      className="w-full h-full object-cover rounded-2xl"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center rounded-2xl bg-white/50">
                      <DynamicIcon
                        name={cat.icon}
                        size={32}
                        className="text-gray-500"
                      />
                    </div>
                  )}

                  {/* "+X more" badge */}
                  {meta.count > 2 && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      +{meta.count - 2} more
                    </div>
                  )}
                </div>

                {/* Label inside card */}
                <p className={`text-[13px] font-medium text-center leading-tight mt-2 line-clamp-2 ${labelColor}`}>
                  {cat.displayName}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export const CategoryImageGrid = memo(CategoryImageGridInner);
