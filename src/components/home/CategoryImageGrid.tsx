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
        {categories.slice(0, 8).map((cat) => {
          const meta = metaMap[cat.category] || { count: 0, images: [] };
          const catColor = cat.color || null;
          const images = meta.images.length > 0
            ? meta.images
            : cat.imageUrl ? [cat.imageUrl] : [];

          return (
            <Link
              key={cat.category}
              to={`/category/${cat.parentGroup}?sub=${cat.category}`}
              className="flex flex-col items-center group active:scale-[0.95] transition-transform duration-150"
            >
              {/* Tile card with color tint */}
              <div
                className="w-full aspect-square rounded-2xl overflow-hidden relative"
                style={{
                  backgroundColor: catColor ? `${catColor}25` : 'hsl(var(--card))',
                  border: catColor ? `1px solid ${catColor}30` : '1px solid hsl(var(--border))',
                }}
              >
                {images.length >= 4 ? (
                  /* 2x2 collage */
                  <div className="category-collage items-4 w-full h-full">
                    {images.slice(0, 4).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                ) : images.length >= 2 ? (
                  /* 2-3 images collage */
                  <div className={`category-collage items-${images.length} w-full h-full`}>
                    {images.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="w-full h-full object-cover"
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
                  /* No images — icon with color gradient */
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      background: catColor
                        ? `radial-gradient(circle at center, ${catColor}35 0%, ${catColor}15 70%)`
                        : undefined,
                    }}
                  >
                    <DynamicIcon
                      name={cat.icon}
                      size={36}
                      className="text-foreground/50"
                      style={catColor ? { color: catColor } : undefined}
                    />
                  </div>
                )}

                {/* Bottom gradient label overlay (only when has images) */}
                {images.length > 0 && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-1.5 pb-1.5 pt-4">
                    <span className="text-[10px] font-bold text-white leading-tight line-clamp-2 drop-shadow-sm">
                      {cat.displayName}
                    </span>
                  </div>
                )}
              </div>

              {/* Label below tile (only when no images — fallback) */}
              {images.length === 0 && (
                <span className="text-[11px] font-semibold text-foreground text-center leading-tight mt-1.5 line-clamp-2 px-0.5">
                  {cat.displayName}
                </span>
              )}

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
