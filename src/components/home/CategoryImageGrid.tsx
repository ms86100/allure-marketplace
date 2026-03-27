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
              <Skeleton className="w-full rounded-2xl h-24" />
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

      {/* 3-column tile grid — compact discovery tiles with glassmorphism */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 stagger-children">
        {categories.slice(0, 9).map((cat) => {
          const meta = metaMap[cat.category] || { count: 0, images: [] };
          const images = meta.images.length > 0
            ? meta.images
            : cat.imageUrl ? [cat.imageUrl] : [];
          const isFoodBev = parentGroup === 'food_beverages';
          const cardBg = isFoodBev ? '#096161' : getCategoryPastel(cat.category, cat.color);
          const labelColor = isFoodBev ? 'text-white' : 'text-gray-900';
          const countColor = isFoodBev ? 'text-white/70' : 'text-gray-500';

          return (
            <Link
              key={cat.category}
              to={`/category/${cat.parentGroup}?sub=${cat.category}`}
              className="flex flex-col items-center group active:scale-[0.96] transition-transform duration-150"
            >
              {/* Glassmorphism outer card */}
              <div
                className="w-full rounded-xl overflow-hidden relative flex flex-col backdrop-blur-2xl shadow-lg"
                style={{
                  backgroundColor: `${cardBg}B3`,
                }}
              >
                {/* Short media strip — thumbnails float inside */}
                <div className="flex items-center justify-center gap-1.5 px-1.5 pt-1.5 pb-0.5">
                  {images.length >= 2 ? (
                    images.slice(0, 2).map((src, i) => (
                      <div
                        key={i}
                        className="w-14 h-14 rounded-lg overflow-hidden bg-white/30 flex-shrink-0 shadow-sm"
                      >
                        <img
                          src={src}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))
                  ) : images.length === 1 ? (
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/30 shadow-sm">
                      <img
                        src={images[0]}
                        alt={cat.displayName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-white/30 flex items-center justify-center">
                      <DynamicIcon
                        name={cat.icon}
                        size={28}
                        className="text-gray-500"
                      />
                    </div>
                  )}
                </div>

                {/* Label + count area */}
                <div className="px-1.5 pb-1.5 pt-0 text-center">
                  <p className={`text-[12px] font-semibold leading-tight line-clamp-2 ${labelColor}`}>
                    {cat.displayName}
                  </p>
                  {meta.count > 0 && (
                    <p className={`text-[10px] mt-0.5 ${countColor}`}>
                      {meta.count} {meta.count === 1 ? 'item' : 'items'}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export const CategoryImageGrid = memo(CategoryImageGridInner);
