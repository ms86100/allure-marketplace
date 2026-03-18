import { useParentGroups, ParentGroupInfo } from '@/hooks/useParentGroups';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { hapticSelection } from '@/lib/haptics';
import { DynamicIcon } from '@/components/ui/DynamicIcon';

interface ParentGroupTabsProps {
  activeGroup: string | null;
  onGroupChange: (slug: string | null) => void;
  activeParentGroups?: Set<string>;
}

export function ParentGroupTabs({ activeGroup, onGroupChange, activeParentGroups }: ParentGroupTabsProps) {
  const { parentGroupInfos, isLoading } = useParentGroups();
  const filteredGroups = activeParentGroups
    ? parentGroupInfos.filter(g => activeParentGroups.has(g.value))
    : parentGroupInfos;

  if (!isLoading && filteredGroups.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto scrollbar-hide px-4 py-1 justify-start">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
            <Skeleton className="w-12 h-12 rounded-full" />
            <Skeleton className="w-10 h-3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const tabs: ParentGroupInfo[] = filteredGroups.length > 1
    ? [{ value: '__all__', label: 'All', icon: 'LayoutGrid', color: '', description: '', layoutType: 'ecommerce' }, ...filteredGroups]
    : filteredGroups;

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 py-1">
      {tabs.map((tab) => {
        const isActive = tab.value === '__all__' ? activeGroup === null : activeGroup === tab.value;
        const tintColor = tab.color || undefined;
        return (
          <button
            key={tab.value}
            onClick={() => {
              hapticSelection();
              // Toggle off if already active, otherwise select
              if (tab.value === '__all__') {
                onGroupChange(null);
              } else {
                onGroupChange(activeGroup === tab.value ? null : tab.value);
              }
            }}
            className="shrink-0 flex flex-col items-center gap-1.5 transition-all duration-200 group"
          >
            {/* Icon circle */}
            <div
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200',
                isActive
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md'
                  : 'hover:scale-105 active:scale-95'
              )}
              style={{
                backgroundColor: tintColor ? `${tintColor}20` : 'hsl(var(--secondary))',
              }}
            >
              <DynamicIcon
                name={tab.icon}
                size={24}
                className={cn(
                  'transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-foreground/70'
                )}
                style={tintColor && !isActive ? { color: tintColor } : undefined}
              />
            </div>
            {/* Label */}
            <span
              className={cn(
                'text-[10px] font-bold leading-tight text-center w-16 line-clamp-2',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
