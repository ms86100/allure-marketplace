import { memo, useMemo } from 'react';
import { optimizedImageUrl, handleImageError } from '@/utils/imageHelpers';
import { Link } from 'react-router-dom';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useProductsByCategory } from '@/hooks/queries/useProductsByCategory';
import { Skeleton } from '@/components/ui/skeleton';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { useMarketplaceLabels } from '@/hooks/useMarketplaceLabels';
import { ChevronRight, Sparkles } from 'lucide-react';
import { getCategoryPastel } from '@/lib/category-pastels';
import { motion } from 'framer-motion';

interface CategoryImageGridProps {
  parentGroup: string;
  title: string;
  activeCategories?: Set<string>;
}

interface CategoryMeta {
  count: number;
  images: string[];
  newCount: number;
}

function buildCategoryMeta(
  productCategories: { category: string; products: any[] }[],
): Record<string, CategoryMeta> {
  const map: Record<string, CategoryMeta> = {};
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const pc of productCategories) {
    const products = pc.products ?? [];
    const images: string[] = [];
    let newCount = 0;
    for (const p of products) {
      if (p.image_url && images.length < 4) {
        images.push(p.image_url);
      }
      if (p.created_at && new Date(p.created_at).getTime() > sevenDaysAgo) {
        newCount++;
      }
    }
    map[pc.category] = { count: products.length, images, newCount };
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
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) return null;

  return (
    <div className="mb-8 px-4">
      {/* Section header with glassmorphic accent */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h3 className="font-extrabold text-base text-foreground tracking-tight">{title}</h3>
        </div>
        <Link
          to={`/category/${parentGroup}`}
          className="text-[11px] font-bold text-primary flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
        >
          See all <ChevronRight size={12} />
        </Link>
      </div>

      {/* Category tiles — glassmorphic cards */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {categories.slice(0, 9).map((cat, index) => {
          const meta = metaMap[cat.category] || { count: 0, images: [], newCount: 0 };
          const images = meta.images.length > 0
            ? meta.images
            : cat.imageUrl ? [cat.imageUrl] : [];

          return (
            <motion.div
              key={cat.category}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.04, duration: 0.3 }}
            >
              <Link
                to={`/category/${cat.parentGroup}?sub=${cat.category}`}
                className="flex flex-col group active:scale-[0.96] transition-transform duration-150"
              >
                {/* Glassmorphic card */}
                <div className="w-full rounded-2xl overflow-hidden relative flex flex-col border border-border/30 backdrop-blur-xl bg-card/50 shadow-sm hover:shadow-md hover:border-border/50 transition-all duration-300">
                  {/* Image area */}
                  <div className="flex items-center justify-center gap-1 px-2 pt-2 pb-1">
                    {images.length >= 2 ? (
                      images.slice(0, 2).map((src, i) => (
                        <div
                          key={i}
                          className="w-[45%] aspect-square rounded-xl overflow-hidden bg-muted/30 flex-shrink-0 ring-1 ring-border/20"
                        >
                          <img
                            src={optimizedImageUrl(src, { width: 120, quality: 70 })}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            decoding="async"
                            onError={handleImageError}
                          />
                        </div>
                      ))
                    ) : images.length === 1 ? (
                      <div className="w-[60%] aspect-square rounded-xl overflow-hidden bg-muted/30 ring-1 ring-border/20">
                        <img
                          src={optimizedImageUrl(images[0], { width: 120, quality: 70 })}
                          alt={cat.displayName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          decoding="async"
                          onError={handleImageError}
                        />
                      </div>
                    ) : (
                      <div className="w-[60%] aspect-square rounded-xl bg-muted/30 flex items-center justify-center ring-1 ring-border/20">
                        <DynamicIcon
                          name={cat.icon}
                          size={28}
                          className="text-muted-foreground"
                        />
                      </div>
                    )}
                  </div>

                  {/* Label + count */}
                  <div className="px-2 pb-2 pt-0.5 text-center relative">
                    {meta.newCount > 0 && (
                      <span className="absolute -top-3 right-1.5 bg-primary text-primary-foreground text-[7px] font-bold px-1.5 py-0.5 rounded-full shadow-sm flex items-center gap-0.5">
                        <Sparkles size={7} />
                        {meta.newCount} new
                      </span>
                    )}
                    <p className="text-[11px] font-semibold leading-tight line-clamp-2 text-foreground">
                      {cat.displayName}
                    </p>
                    {meta.count > 0 && (
                      <p className="text-[9px] mt-0.5 text-muted-foreground font-medium">
                        {meta.count} {meta.count === 1 ? 'item' : 'items'} →
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export const CategoryImageGrid = memo(CategoryImageGridInner);
