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

const CATEGORY_PASTELS: Record<string, string> = {
  home_food: '#E8F5E9',
  bakery: '#FFF3E0',
  snacks: '#FFF8E1',
  groceries: '#E3F2FD',
  beverages: '#E0F2F1',
  dairy: '#FFF8E1',
  fruits: '#E8F5E9',
  vegetables: '#E8F5E9',
  sweets: '#FFF3E0',
  meat: '#FFEBEE',
  seafood: '#E0F7FA',
  pet_supplies: '#F3E5F5',
  stationery: '#E8EAF6',
  electronics: '#E3F2FD',
  clothing: '#FCE4EC',
  beauty: '#FDE0DC',
  health: '#E0F2F1',
  home_services: '#E8F5E9',
  cleaning: '#E0F7FA',
  repairs: '#FFF8E1',
};
const DEFAULT_PASTEL = '#F5F5F5';

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
          const pastelColor = CATEGORY_PASTELS[cat.category] || DEFAULT_PASTEL;

          return (
            <Link
              key={cat.category}
              to={`/category/${cat.parentGroup}?sub=${cat.category}`}
              className="flex flex-col items-center group active:scale-[0.96] transition-transform duration-150"
            >
              {/* Pastel card tile */}
              <div
                className="w-full rounded-2xl overflow-hidden relative p-3 shadow-sm"
                style={{ backgroundColor: pastelColor }}
              >
                {/* Image area — fixed height */}
                <div className="relative">
                  {images.length >= 2 ? (
                    <div className="flex gap-1.5 h-20">
                      {images.slice(0, 2).map((src, i) => (
                        <div key={i} className="flex-1 h-full">
                          <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover rounded-xl"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  ) : images.length === 1 ? (
                    <div className="h-20">
                      <img
                        src={images[0]}
                        alt={cat.displayName}
                        className="w-full h-full object-cover rounded-xl"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="h-20 flex items-center justify-center rounded-xl bg-white/50">
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
                <p className="text-[13px] font-medium text-gray-900 text-center leading-tight mt-2 line-clamp-2">
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
