import { useParentGroups, ParentGroupInfo } from '@/hooks/useParentGroups';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { hapticSelection } from '@/lib/haptics';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { motion } from 'framer-motion';

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
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 py-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="w-20 h-20 rounded-2xl shrink-0" />
        ))}
      </div>
    );
  }

  const tabs: ParentGroupInfo[] = filteredGroups.length > 1
    ? [{ value: '__all__', label: 'All', icon: 'LayoutGrid', color: '', description: '', layoutType: 'ecommerce' }, ...filteredGroups]
    : filteredGroups;

  return (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 py-2">
      {tabs.map((tab, index) => {
        const isActive = tab.value === '__all__' ? activeGroup === null : activeGroup === tab.value;
        return (
          <motion.button
            key={tab.value}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3 }}
            onClick={() => {
              hapticSelection();
              if (tab.value === '__all__') {
                onGroupChange(null);
              } else {
                onGroupChange(activeGroup === tab.value ? null : tab.value);
              }
            }}
            className={cn(
              'flex flex-col items-center gap-1.5 shrink-0 px-4 py-3 rounded-2xl transition-all duration-300 relative min-w-[72px]',
              'border backdrop-blur-xl',
              isActive
                ? 'bg-primary/15 border-primary/30 shadow-[0_0_20px_hsl(var(--primary)/0.15)] text-primary'
                : 'bg-card/40 border-border/30 text-muted-foreground hover:bg-card/60 hover:border-border/50 active:scale-95'
            )}
          >
            {/* Glassmorphic glow for active state */}
            {isActive && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
            )}

            <div className={cn(
              'relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300',
              isActive
                ? 'bg-primary/20 shadow-sm'
                : 'bg-muted/50'
            )}>
              <DynamicIcon
                name={tab.icon}
                size={18}
                className={cn(
                  'transition-all duration-300',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
            </div>

            <span className={cn(
              'text-[10px] whitespace-nowrap leading-none transition-all duration-300',
              isActive ? 'font-bold text-primary' : 'font-medium'
            )}>
              {tab.label}
            </span>

            {/* Active indicator dot */}
            {isActive && (
              <motion.div
                layoutId="parentGroupDot"
                className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
