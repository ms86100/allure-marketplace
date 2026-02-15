import { Link } from 'react-router-dom';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const GROUP_TINTS: Record<string, string> = {
  food: 'bg-[hsl(var(--tint-food))]',
  services: 'bg-[hsl(var(--tint-services))]',
  personal: 'bg-[hsl(var(--tint-personal))]',
  resale: 'bg-[hsl(var(--tint-resale))]',
  events: 'bg-[hsl(var(--tint-events))]',
};

interface CategoryImageGridProps {
  parentGroup: string;
  title: string;
}

export function CategoryImageGrid({ parentGroup, title }: CategoryImageGridProps) {
  const { groupedConfigs, isLoading } = useCategoryConfigs();
  const categories = groupedConfigs[parentGroup] || [];
  const tint = GROUP_TINTS[parentGroup] || 'bg-[hsl(var(--tint-default))]';

  if (isLoading) {
    return (
      <div className="px-4">
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) return null;

  return (
    <div className="animate-fade-in">
      <h3 className="font-bold text-base text-foreground px-4 mb-3">{title}</h3>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-1">
        {categories.map((cat) => (
          <Link
            key={cat.category}
            to={`/category/${cat.parentGroup}?sub=${cat.category}`}
            className="group shrink-0 w-[90px] flex flex-col items-center gap-1.5"
          >
            <div
              className={cn(
                'w-[90px] h-[90px] rounded-2xl overflow-hidden',
                'border border-border/10',
                'transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg group-active:scale-95',
                'flex items-center justify-center',
                tint
              )}
            >
              {cat.imageUrl ? (
                <img
                  src={cat.imageUrl}
                  alt={cat.displayName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-4xl drop-shadow-sm">{cat.icon}</span>
              )}
            </div>
            <span className="text-[10px] font-semibold text-center leading-tight text-foreground line-clamp-2 max-w-[90px]">
              {cat.displayName}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
