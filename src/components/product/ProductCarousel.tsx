import useEmblaCarousel from 'embla-carousel-react';
import { ChevronRight } from 'lucide-react';
import { ProductGridCard, ProductWithSeller } from './ProductGridCard';
import { CategoryBehavior } from '@/types/categories';
import { cn } from '@/lib/utils';

interface ProductCarouselProps {
  title: string;
  itemCount?: number;
  emoji?: string;
  products: ProductWithSeller[];
  behavior?: CategoryBehavior | null;
  onSeeAll?: () => void;
  onProductTap?: (product: ProductWithSeller) => void;
  variant?: 'compact' | 'featured';
  className?: string;
}

export function ProductCarousel({
  title,
  itemCount,
  emoji,
  products,
  behavior,
  onSeeAll,
  onProductTap,
  variant = 'compact',
  className,
}: ProductCarouselProps) {
  const [emblaRef] = useEmblaCarousel({
    align: 'start',
    dragFree: true,
    containScroll: 'trimSnaps',
  });

  if (products.length === 0) return null;

  const cardWidth = variant === 'compact' ? 'w-[152px]' : 'w-[200px]';

  return (
    <div className={cn('', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-2.5">
        <div className="flex items-center gap-2">
          {emoji && <span className="text-base">{emoji}</span>}
          <h3 className="font-semibold text-sm">{title}</h3>
          {itemCount !== undefined && (
            <span className="text-xs text-muted-foreground">({itemCount})</span>
          )}
        </div>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-xs text-primary font-medium flex items-center gap-0.5"
          >
            See All <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Carousel */}
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex gap-3 pl-4 pr-2">
          {products.map((product) => (
            <div key={product.id} className={cn('shrink-0', cardWidth)}>
              <ProductGridCard
                product={product}
                behavior={behavior}
                onTap={onProductTap}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
