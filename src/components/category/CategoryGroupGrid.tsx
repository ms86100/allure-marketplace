import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCategoryConfigs } from '@/hooks/useCategoryBehavior';
import { useParentGroups } from '@/hooks/useParentGroups';
import { ServiceCategory } from '@/types/categories';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface CategoryGroupGridProps {
  variant?: 'compact' | 'expanded' | 'selection';
  selectedCategories?: ServiceCategory[];
  onCategorySelect?: (category: ServiceCategory, selected: boolean) => void;
  selectedGroup?: string | null;
  onGroupSelect?: (group: string) => void;
  excludeGroups?: string[];
}

export function CategoryGroupGrid({
  variant = 'compact',
  selectedCategories = [],
  onCategorySelect,
  selectedGroup,
  onGroupSelect,
  excludeGroups = [],
}: CategoryGroupGridProps) {
  const { groupedConfigs, isLoading: configsLoading } = useCategoryConfigs();
  const { parentGroupInfos, isLoading: groupsLoading } = useParentGroups();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const isLoading = configsLoading || groupsLoading;

  // Filter out excluded groups
  const filteredGroups = parentGroupInfos.filter(g => !excludeGroups.includes(g.value));

  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  // Compact horizontal scroll variant for homepage
  if (variant === 'compact') {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2 -mx-4 px-4">
          {filteredGroups.filter(g => groupedConfigs[g.value]?.length > 0).map(({ value, label, icon, color }) => (
            <Link
              key={value}
              to={`/category/${value}`}
              className="flex flex-col items-center gap-1.5 min-w-[72px]"
            >
              <div
                className={cn(
                  'w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm transition-transform hover:scale-105',
                  color
                )}
              >
                {icon}
              </div>
              <span className="text-xs font-medium text-center leading-tight">{label.split(' ')[0]}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Expanded variant with sub-categories visible
  if (variant === 'expanded') {
    return (
      <div className="space-y-6">
        {filteredGroups.filter(g => groupedConfigs[g.value]?.length > 0).map(({ value, label, icon, color, description }) => (
          <div key={value} className="space-y-3">
            <button
              onClick={() => setExpandedGroup(expandedGroup === value ? null : value)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-lg', color)}>
                  {icon}
                </div>
                <div className="text-left">
                  <h3 className="font-semibold">{label}</h3>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
              {expandedGroup === value ? (
                <ChevronDown size={20} className="text-muted-foreground" />
              ) : (
                <ChevronRight size={20} className="text-muted-foreground" />
              )}
            </button>

            {expandedGroup === value && (
              <div className="grid grid-cols-3 gap-2 pl-13">
                {groupedConfigs[value]?.map((config) => (
                  <Link
                    key={config.category}
                    to={`/category/${value}?sub=${config.category}`}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <span className="text-xl">{config.icon}</span>
                    <span className="text-xs font-medium text-center">{config.displayName}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Selection variant for seller registration
  if (variant === 'selection') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {filteredGroups.filter(g => groupedConfigs[g.value]?.length > 0).map(({ value, label, icon, color }) => (
            <button
              key={value}
              onClick={() => onGroupSelect?.(value)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border-2 transition-all',
                selectedGroup === value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30'
              )}
            >
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-lg', color)}>
                {icon}
              </div>
              <span className="font-medium text-sm">{label}</span>
            </button>
          ))}
        </div>

        {selectedGroup && groupedConfigs[selectedGroup] && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Select your categories:</p>
            <div className="grid grid-cols-2 gap-2">
              {groupedConfigs[selectedGroup].map((config) => {
                const isSelected = selectedCategories.includes(config.category);
                return (
                  <button
                    key={config.category}
                    onClick={() => onCategorySelect?.(config.category, !isSelected)}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    )}
                  >
                    <span className="text-lg">{config.icon}</span>
                    <span className="text-sm font-medium">{config.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
