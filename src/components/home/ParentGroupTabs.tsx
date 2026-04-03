import { useParentGroups, ParentGroupInfo } from '@/hooks/useParentGroups';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { hapticSelection } from '@/lib/haptics';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ParentGroupTabsProps {
  activeGroup: string | null;
  onGroupChange: (slug: string | null) => void;
  activeParentGroups?: Set<string>;
}

// Warm tint per category type for visual variety
const GROUP_ACCENTS: Record<string, { gradient: string; iconBg: string; emoji: string }> = {
  food_beverages: {
    gradient: 'from-orange-500/20 via-amber-500/10 to-transparent',
    iconBg: 'bg-orange-500/15',
    emoji: '🍽️',
  },
  services: {
    gradient: 'from-blue-500/20 via-sky-500/10 to-transparent',
    iconBg: 'bg-blue-500/15',
    emoji: '🔧',
  },
  education: {
    gradient: 'from-violet-500/20 via-purple-500/10 to-transparent',
    iconBg: 'bg-violet-500/15',
    emoji: '📚',
  },
  fitness_wellness: {
    gradient: 'from-emerald-500/20 via-green-500/10 to-transparent',
    iconBg: 'bg-emerald-500/15',
    emoji: '💪',
  },
};

const DEFAULT_ACCENT = {
  gradient: 'from-primary/20 via-primary/5 to-transparent',
  iconBg: 'bg-primary/15',
  emoji: '📦',
};

export function ParentGroupTabs({ activeGroup, onGroupChange, activeParentGroups }: ParentGroupTabsProps) {
  const { parentGroupInfos, isLoading } = useParentGroups();
  const navigate = useNavigate();
  const filteredGroups = activeParentGroups
    ? parentGroupInfos.filter(g => activeParentGroups.has(g.value))
    : parentGroupInfos;

  if (!isLoading && filteredGroups.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="px-4 py-2">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="w-36 h-[72px] rounded-2xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  // For single group — show as a large featured card, not a tab
  if (filteredGroups.length === 1) {
    const group = filteredGroups[0];
    const accent = GROUP_ACCENTS[group.value] || DEFAULT_ACCENT;
    const isActive = activeGroup === group.value;

    return (
      <div className="px-4 py-1">
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          onClick={() => {
            hapticSelection();
            onGroupChange(isActive ? null : group.value);
          }}
          className={cn(
            'w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 relative overflow-hidden',
            'border backdrop-blur-xl',
            isActive
              ? 'bg-primary/10 border-primary/25 shadow-[0_2px_20px_hsl(var(--primary)/0.12)]'
              : 'bg-card/60 border-border/30 hover:border-border/50 active:scale-[0.98]'
          )}
        >
          {/* Gradient background wash */}
          <div className={cn(
            'absolute inset-0 bg-gradient-to-r pointer-events-none opacity-60',
            accent.gradient
          )} />

          {/* Icon */}
          <div className={cn(
            'relative shrink-0 w-11 h-11 rounded-xl flex items-center justify-center',
            accent.iconBg
          )}>
            <span className="text-xl">{accent.emoji}</span>
          </div>

          {/* Text */}
          <div className="relative flex-1 text-left">
            <p className="text-sm font-bold text-foreground">{group.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
              {group.description || 'Tap to explore categories'}
            </p>
          </div>

          {/* Arrow */}
          <div className="relative shrink-0">
            <ChevronRight size={18} className={cn(
              'transition-transform duration-300',
              isActive ? 'rotate-90 text-primary' : 'text-muted-foreground'
            )} />
          </div>
        </motion.button>
      </div>
    );
  }

  // Multiple groups — horizontal scrollable chips with "All" option
  const tabs: ParentGroupInfo[] = [
    { value: '__all__', label: 'All', icon: 'LayoutGrid', color: '', description: '', layoutType: 'ecommerce' },
    ...filteredGroups,
  ];

  return (
    <div className="px-4 py-1">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {tabs.map((tab, index) => {
          const isActive = tab.value === '__all__' ? activeGroup === null : activeGroup === tab.value;
          const accent = GROUP_ACCENTS[tab.value] || DEFAULT_ACCENT;

          return (
            <motion.button
              key={tab.value}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              onClick={() => {
                hapticSelection();
                if (tab.value === '__all__') {
                  onGroupChange(null);
                } else {
                  onGroupChange(activeGroup === tab.value ? null : tab.value);
                }
              }}
              className={cn(
                'flex items-center gap-2 shrink-0 px-4 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden',
                'border backdrop-blur-xl',
                isActive
                  ? 'bg-primary/12 border-primary/30 shadow-sm text-primary'
                  : 'bg-card/50 border-border/25 text-muted-foreground hover:bg-card/70 active:scale-95'
              )}
            >
              {isActive && (
                <div className={cn(
                  'absolute inset-0 bg-gradient-to-r pointer-events-none opacity-40',
                  accent.gradient
                )} />
              )}

              <div className={cn(
                'relative w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-300',
                isActive ? accent.iconBg : 'bg-muted/40'
              )}>
                {tab.value === '__all__' ? (
                  <DynamicIcon name="LayoutGrid" size={14} />
                ) : (
                  <span className="text-sm">{accent.emoji}</span>
                )}
              </div>

              <span className={cn(
                'relative text-xs whitespace-nowrap transition-all duration-300',
                isActive ? 'font-bold' : 'font-medium'
              )}>
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
