import { memo } from 'react';
import { Home, Building2, LayoutGrid, ShoppingCart, User, Shield, ClipboardList, Briefcase, ListChecks } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { hapticSelection } from '@/lib/haptics';
import { useEffectiveFeatures } from '@/hooks/useEffectiveFeatures';
import { useCartCount } from '@/hooks/useCartCount';
import { useAuth } from '@/contexts/AuthContext';
import type { FeatureKey } from '@/hooks/useEffectiveFeatures';

const residentNavItems: { to: string; icon: typeof Home; label: string; featureKey?: FeatureKey; badge?: string }[] = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/society', icon: Building2, label: 'Society' },
  { to: '/categories', icon: LayoutGrid, label: 'Browse' },
  { to: '/cart', icon: ShoppingCart, label: 'Cart', badge: 'cart' },
  { to: '/profile', icon: User, label: 'Account' },
];

const securityNavItems: { to: string; icon: typeof Shield; label: string }[] = [
  { to: '/guard-kiosk', icon: Shield, label: 'Kiosk' },
  { to: '/security/audit', icon: ClipboardList, label: 'History' },
  { to: '/profile', icon: User, label: 'Profile' },
];

const workerNavItems: { to: string; icon: typeof Briefcase; label: string }[] = [
  { to: '/worker/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/worker/my-jobs', icon: ListChecks, label: 'My Jobs' },
  { to: '/profile', icon: User, label: 'Profile' },
];

function BottomNavInner() {
  const location = useLocation();
  const { features, isFeatureEnabled, isLoading } = useEffectiveFeatures();
  const { isAdmin, isSocietyAdmin, isBuilderMember, roles, isSecurityOfficer, isWorker } = useAuth();
  const itemCount = useCartCount();

  const isPrimaryRoleUser = isAdmin || isSocietyAdmin || isBuilderMember;
  const navItems = !isPrimaryRoleUser && isSecurityOfficer
    ? securityNavItems
    : !isPrimaryRoleUser && isWorker
      ? workerNavItems
      : residentNavItems;

  const hasAnyFeature = features.some(f => f.is_enabled && f.society_configurable);

  const visibleItems = isLoading
    ? navItems
    : navItems.filter(item => {
        if (item.to === '/society' && !hasAnyFeature && !isAdmin) return false;
        if ('featureKey' in item && item.featureKey) return isFeatureEnabled((item as any).featureKey);
        return true;
      });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 bg-background/98 dark:bg-[hsl(20_10%_5%/0.98)] backdrop-blur-lg border-t border-border/60 dark:border-[hsl(20_8%_16%/0.6)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around px-1 h-16">
        {visibleItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || 
            (to !== '/' && location.pathname.startsWith(to));
          const showCartBadge = to === '/cart' && itemCount > 0 && location.pathname !== '/cart';
          
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => hapticSelection()}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-2xl transition-all duration-200 min-w-[52px] relative',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'relative flex items-center justify-center w-11 h-8 rounded-full transition-all duration-200',
                isActive && 'bg-primary/15'
              )}>
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.4 : 1.7}
                  className="transition-all duration-200"
                />
                {showCartBadge && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center shadow-sm">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </div>
              <span className={cn(
                'text-[10px] leading-none',
                isActive ? 'font-bold' : 'font-medium'
              )}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export const BottomNav = memo(BottomNavInner);
