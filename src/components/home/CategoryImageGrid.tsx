import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useProductsByCategory } from '@/hooks/queries/useProductsByCategory';
import { useCurrency } from '@/hooks/useCurrency';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Users, Tag, Star } from 'lucide-react';

interface CategoryImageGridProps {
  parentGroup: string;
  title: string;
  activeCategories?: Set<string>;
}

/* ── Metadata builder (same logic as CategoriesPage) ─── */

interface CategoryMeta {
  count: number;
  sellerCount: number;
  minPrice: number | null;
  collageImages: string[];
  hasBestseller: boolean;
}

function buildCategoryMeta(
  productCategories: { category: string; products: any[] }[],
): Record<string, CategoryMeta> {
  const map: Record<string, CategoryMeta> = {};
  for (const pc of productCategories) {
    const products = pc.products ?? [];
    const sellers = new Set<string>();
    const images: string[] = [];
    let min: number | null = null;
    let bestseller = false;

    for (const p of products) {
      if (p.seller_id) sellers.add(p.seller_id);
      if (p.image_url && images.length < 4 && !images.includes(p.image_url)) {
        images.push(p.image_url);
      }
      const price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
      if (!isNaN(price) && (min === null || price < min)) min = price;
      if (p.is_bestseller) bestseller = true;
    }

    map[pc.category] = { count: products.length, sellerCount: sellers.size, minPrice: min, collageImages: images, hasBestseller: bestseller };
  }
  return map;
}

/* ── Image collage (same as CategoriesPage) ──────────── */

function ImageCollage({ images, fallbackIcon, fallbackUrl, alt }: {
  images: string[];
  fallbackIcon: string;
  fallbackUrl?: string | null;
  alt: string;
}) {
  if (images.length === 0 && fallbackUrl) {
    return <img src={fallbackUrl} alt={alt} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />;
  }
  if (images.length === 0) {
    return (
      <div className="absolute inset-0 bg-muted flex items-center justify-center">
        <span className="text-3xl">{fallbackIcon}</span>
      </div>
    );
  }
  const itemClass = `items-${Math.min(images.length, 4)}`;
  return (
    <div className={cn('category-collage absolute inset-0', itemClass)}>
      {images.slice(0, 4).map((src, i) => (
        <img key={i} src={src} alt={`${alt} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
      ))}
    </div>
  );
}

/* ── Main component ──────────────────────────────────── */

function CategoryImageGridInner({ parentGroup, title, activeCategories }: CategoryImageGridProps) {
  const { groupedConfigs, isLoading } = useCategoryConfigs();
  const { data: productCategories = [], isLoading: productsLoading } = useProductsByCategory();
  const { formatPrice } = useCurrency();

  const allCategories = groupedConfigs[parentGroup] || [];
  const categories = activeCategories
    ? allCategories.filter(c => activeCategories.has(c.category))
    : allCategories;

  const metaMap = useMemo(() => buildCategoryMeta(productCategories), [productCategories]);

  if (isLoading || productsLoading) {
    return (
      <div className="px-4 mb-4">
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="aspect-[3/2] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) return null;

  return (
    <div className="mb-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2 px-4">
        <h3 className="font-bold text-sm text-foreground">{title}</h3>
        <span className="text-[10px] text-muted-foreground">({categories.length})</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* 2-column enriched card grid — matches CategoriesPage */}
      <div className="grid grid-cols-2 gap-3 px-4">
        {categories.slice(0, 6).map((cat) => {
          const meta = metaMap[cat.category] || { count: 0, sellerCount: 0, minPrice: null, collageImages: [], hasBestseller: false };
          return (
            <Link
              key={cat.category}
              to={`/category/${cat.parentGroup}?sub=${cat.category}`}
              className="block rounded-2xl overflow-hidden shadow-sm active:scale-[0.97] transition-transform group bg-card border border-border"
            >
              {/* Image area */}
              <div className="relative aspect-[3/2] overflow-hidden">
                <ImageCollage
                  images={meta.collageImages}
                  fallbackIcon={cat.icon}
                  fallbackUrl={cat.imageUrl}
                  alt={cat.displayName}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

                {/* Count badge — top right */}
                {meta.count > 0 && (
                  <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[9px] font-bold shadow-sm">
                    {meta.count} items
                  </div>
                )}

                {/* Bestseller star — top left */}
                {meta.hasBestseller && (
                  <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-warning/90 flex items-center justify-center shadow-sm">
                    <Star size={12} className="text-white fill-white" />
                  </div>
                )}

                {/* Category name overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <span className="text-sm font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                    {cat.displayName}
                  </span>
                </div>
              </div>

              {/* Metadata row */}
              <div className="flex items-center gap-2 px-2.5 py-2 text-[10px] text-muted-foreground">
                {meta.sellerCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Users size={10} className="shrink-0" />
                    {meta.sellerCount} {meta.sellerCount === 1 ? 'seller' : 'sellers'}
                  </span>
                )}
                {meta.minPrice !== null && (
                  <span className="inline-flex items-center gap-0.5">
                    <Tag size={10} className="shrink-0" />
                    From {formatPrice(meta.minPrice)}
                  </span>
                )}
                {meta.sellerCount === 0 && meta.minPrice === null && (
                  <span className="text-muted-foreground/60">Explore →</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export const CategoryImageGrid = memo(CategoryImageGridInner);
