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
  representativeImage: string | null;
}

function buildCategoryMeta(
  productCategories: { category: string; products: any[] }[],
): Record<string, CategoryMeta> {
  const map: Record<string, CategoryMeta> = {};
  for (const pc of productCategories) {
    const products = pc.products ?? [];
    let image: string | null = null;
    for (const p of products) {
      if (p.image_url) { image = p.image_url; break; }
    }
    map[pc.category] = { count: products.length, representativeImage: image };
  }
  return map;
}

function CategoryImageGridInner({ parentGroup, title, activeCategories }: CategoryImageGridProps) {
  const { groupedConfigs, isLoading } = useCategoryConfigs();
  const { data: productCategories = [], isLoading: productsLoading } = useProductsByCategory();
  const ml = useMarketplaceLabels();

  const allCategories = groupedConfigs[parentGroup] || [];
  const categories = activeCategories
    ? allCategories.filter(c => activeCategories.has(c.category))
    : allCategories;

  const metaMap = useMemo(() => buildCategoryMeta(productCategories), [productCategories]);

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

      {/* 4-column tile grid */}
      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
        {categories.slice(0, 12).map((cat) => {
          const meta = metaMap[cat.category] || { count: 0, representativeImage: null };
          const catColor = cat.color || null;
          const imageSrc = meta.representativeImage || cat.imageUrl || null;

          return (
            <Link
              key={cat.category}
              to={`/category/${cat.parentGroup}?sub=${cat.category}`}
              className="flex flex-col items-center group active:scale-[0.95] transition-transform duration-150"
            >
              {/* Tile image */}
              <div
                className="w-full aspect-square rounded-2xl overflow-hidden flex items-center justify-center"
                style={{
                  backgroundColor: catColor ? `${catColor}15` : 'hsl(var(--secondary))',
                }}
              >
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={cat.displayName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: catColor ? `${catColor}25` : undefined }}
                  >
                    <DynamicIcon
                      name={cat.icon}
                      size={24}
                      className="text-foreground/60"
                      style={catColor ? { color: catColor } : undefined}
                    />
                  </div>
                )}
              </div>

              {/* Label below tile */}
              <span className="text-[11px] font-semibold text-foreground text-center leading-tight mt-1.5 line-clamp-2 px-0.5">
                {cat.displayName}
              </span>

              {/* Item count */}
              {meta.count > 0 && (
                <span className="text-[9px] text-muted-foreground font-medium mt-0.5">
                  {meta.count} {ml.label('label_item_count')}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export const CategoryImageGrid = memo(CategoryImageGridInner);
