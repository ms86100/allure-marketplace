import { Home, Store, Users, Building2, User, Shield, ClipboardList, Briefcase, ListChecks } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { useEffectiveFeatures } from '@/hooks/useEffectiveFeatures';
import { useSecurityOfficer } from '@/hooks/useSecurityOfficer';
import { useWorkerRole } from '@/hooks/useWorkerRole';
import { useCart } from '@/hooks/useCart';
import type { FeatureKey } from '@/hooks/useEffectiveFeatures';

const residentNavItems: { to: string; icon: typeof Home; label: string; featureKey?: FeatureKey }[] = [
  { to: '/', icon: Home, label: 'Home' },
  // Marketplace is now integrated into Home — removed separate route
  { to: '/community', icon: Users, label: 'Community', featureKey: 'bulletin' },
  { to: '/society', icon: Building2, label: 'Society' },
  { to: '/profile', icon: User, label: 'Profile' },
];

const securityNavItems: { to: string; icon: typeof Shield; label: string }[] = [
  { to: '/security/verify', icon: Shield, label: 'Verify' },
  { to: '/security/audit', icon: ClipboardList, label: 'History' },
  { to: '/profile', icon: User, label: 'Profile' },
];

const workerNavItems: { to: string; icon: typeof Briefcase; label: string }[] = [
  { to: '/worker/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/worker/my-jobs', icon: ListChecks, label: 'My Jobs' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
  const location = useLocation();
  const { isFeatureEnabled, isLoading } = useEffectiveFeatures();
  const { isSecurityOfficer } = useSecurityOfficer();
  const { isWorker } = useWorkerRole();
  const { itemCount } = useCart();
  const { selectionChanged } = useHaptics();

  // Role-based navigation: security officers and workers get restricted nav
  const navItems = isSecurityOfficer ? securityNavItems : isWorker ? workerNavItems : residentNavItems;

  const visibleItems = isLoading
    ? navItems
    : navItems.filter(item => !('featureKey' in item && item.featureKey) || isFeatureEnabled((item as any).featureKey));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {visibleItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || 
            (to !== '/' && location.pathname.startsWith(to));
          
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => selectionChanged()}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px] relative',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={cn('text-[10px]', isActive ? 'font-bold' : 'font-medium')}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
