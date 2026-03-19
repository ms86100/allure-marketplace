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
      <div className="grid grid-cols-4 gap-3 px-4 py-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <Skeleton className="w-10 h-2.5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const tabs: ParentGroupInfo[] = filteredGroups.length > 1
    ? [{ value: '__all__', label: 'All', icon: 'LayoutGrid', color: '', description: '', layoutType: 'ecommerce' }, ...filteredGroups]
    : filteredGroups;

  const useGrid = tabs.length <= 8;

  return (
    <div className={cn(
      useGrid
        ? 'grid grid-cols-4 gap-y-3 gap-x-3 px-4 py-1'
        : 'flex gap-3 overflow-x-auto scrollbar-hide px-4 py-1'
    )}>
      {tabs.map((tab) => {
        const isActive = tab.value === '__all__' ? activeGroup === null : activeGroup === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => {
              hapticSelection();
              if (tab.value === '__all__') {
                onGroupChange(null);
              } else {
                onGroupChange(activeGroup === tab.value ? null : tab.value);
              }
            }}
            className={cn(
              'flex flex-col items-center gap-1 transition-all duration-150 group',
              !useGrid && 'shrink-0'
            )}
          >
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-150',
                isActive
                  ? 'bg-primary/10 ring-1.5 ring-primary'
                  : 'bg-secondary hover:bg-muted active:scale-95'
              )}
            >
              <DynamicIcon
                name={tab.icon}
                size={22}
                className={cn(
                  'transition-colors duration-150',
                  isActive ? 'text-primary' : 'text-foreground/60'
                )}
              />
            </div>
            <span
              className={cn(
                'text-[10px] font-semibold leading-tight text-center w-14 line-clamp-1',
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