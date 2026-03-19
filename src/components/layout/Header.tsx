import { useState, useCallback, memo, useMemo } from 'react';
import { ArrowLeft, Bell, Building2, ShieldCheck, Store, MapPin, ChevronDown, Search } from 'lucide-react';

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/hooks/useCart';
import { cn } from '@/lib/utils';
import { TypewriterPlaceholder } from '@/components/search/TypewriterPlaceholder';
import { ActiveOrderETA } from '@/components/header/ActiveOrderETA';
import { useUnreadNotificationCount } from '@/hooks/useUnreadNotificationCount';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { LocationSelectorSheet } from '@/components/location/LocationSelectorSheet';

interface HeaderProps {
  showCart?: boolean;
  showLocation?: boolean;
  title?: string;
  showBack?: boolean;
  className?: string;
}

function getGreeting(name?: string | null): string {
  const hour = new Date().getHours();
  const firstName = name?.split(' ')[0] || '';
  const prefix = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${prefix}, ${firstName}` : prefix;
}

function HeaderInner({ 
  showCart = true, 
  title,
  showBack,
  className 
}: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);

  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/society');
    }
  }, [navigate]);

  const { profile, society, user, viewAsSocietyId, effectiveSociety, effectiveSocietyId, setViewAsSociety, isAdmin, isBuilderMember, isSeller } = useAuth();
  const { itemCount } = useCart();
  const unreadCount = useUnreadNotificationCount();
  const { browsingLocation } = useBrowsingLocation();

  const displaySociety = effectiveSociety || society;
  const isViewingAs = viewAsSocietyId && (isAdmin || isBuilderMember);

  const initials = profile?.name
    ? profile.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const greeting = useMemo(() => getGreeting(profile?.name), [profile?.name]);

  return (
    <>
      <header className={cn(
        'sticky top-0 z-40 bg-background border-b border-border/50',
        className
      )}>
        <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 space-y-1.5">
          {/* Tagline */}
          <p className="text-[11px] font-medium text-primary tracking-wide">Your society, your marketplace</p>

          {/* Row 1: Location/greeting + actions */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              {!title ? (
                <button
                  type="button"
                  onClick={() => setLocationSheetOpen(true)}
                  className="flex items-center gap-2 group"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin size={15} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-foreground truncate max-w-[50vw]">
                        {browsingLocation?.label || displaySociety?.name || 'Set location'}
                      </span>
                      <ChevronDown size={14} className="text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full shrink-0"
                    onClick={handleBack}
                  >
                    <ArrowLeft size={18} />
                  </Button>
                  <span className="text-base font-bold text-foreground truncate">{title}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <ThemeToggle className="h-9 w-9 rounded-full text-foreground hover:bg-secondary" />
              {isBuilderMember && (
                <Link to="/builder">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                    <Building2 size={17} />
                  </Button>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                    <ShieldCheck size={17} />
                  </Button>
                </Link>
              )}
              {isSeller && (
                <Link to="/seller">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                    <Store size={17} />
                  </Button>
                </Link>
              )}
              {user && (
                <>
                  <Link to="/notifications/inbox">
                    <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
                      <Bell size={17} />
                      {unreadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link to="/profile">
                    <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[11px] font-bold cursor-pointer hover:opacity-90 transition-opacity">
                      {initials}
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Row 2: Search bar — only on home */}
          {!title && (
            <Link to="/search" className="block mt-3">
              <div className="flex items-center gap-3 bg-secondary/80 border border-border/50 rounded-xl px-4 py-2.5 transition-all hover:border-primary/30 hover:shadow-sm">
                <Search size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <TypewriterPlaceholder context="home" />
                </div>
              </div>
            </Link>
          )}
        </div>

        <ActiveOrderETA />
        <LocationSelectorSheet open={locationSheetOpen} onOpenChange={setLocationSheetOpen} />
      </header>

      {isViewingAs && (
        <div className="sticky top-[130px] z-39 bg-warning/10 border-b border-warning/20 px-4 py-2 flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">
            Viewing: <span className="font-bold">{effectiveSociety?.name}</span>
          </p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setViewAsSociety(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </Button>
        </div>
      )}
    </>
  );
}

export const Header = memo(HeaderInner);
