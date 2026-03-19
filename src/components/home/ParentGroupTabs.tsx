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
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <Skeleton className="w-12 h-2.5 rounded" />
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
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-1">
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
              'flex flex-col items-center gap-1 shrink-0 px-3 py-2 transition-all duration-200 relative',
              isActive
                ? 'text-primary'
                : 'text-foreground/60 hover:text-foreground active:scale-95'
            )}
          >
            <DynamicIcon
              name={tab.icon}
              size={18}
              className="shrink-0"
            />
            <span className="text-[10px] font-semibold whitespace-nowrap leading-none">
              {tab.label}
            </span>
            {isActive && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
