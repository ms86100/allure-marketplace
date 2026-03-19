import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { ArrowLeft, Bell, Building, Building2, ShieldCheck, Users, Store, Verified, MapPin, ChevronDown } from 'lucide-react';

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/hooks/useCart';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { TypewriterPlaceholder } from '@/components/search/TypewriterPlaceholder';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { ActiveOrderETA } from '@/components/header/ActiveOrderETA';
import { useUnreadNotificationCount } from '@/hooks/useUnreadNotificationCount';
import { useSocietyStats } from '@/hooks/useSocietyStats';
import { useBrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { LocationSelectorSheet } from '@/components/location/LocationSelectorSheet';
import { useLocationStats } from '@/hooks/queries/useLocationStats';

interface HeaderProps {
  showCart?: boolean;
  showLocation?: boolean;
  title?: string;
  showBack?: boolean;
  className?: string;
}

function HeaderInner({ 
  showCart = true, 
  title,
  showBack,
  className 
}: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSystemSettings();
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);

  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/society');
    }
  }, [navigate]);
  const { profile, isApproved, society, user, viewAsSocietyId, effectiveSociety, effectiveSocietyId, setViewAsSociety, isAdmin, isBuilderMember, isSeller } = useAuth();
  const { itemCount } = useCart();
  const { selectionChanged } = useHaptics();
  const unreadCount = useUnreadNotificationCount();
  const societyStats = useSocietyStats(effectiveSocietyId, isApproved);
  const { browsingLocation } = useBrowsingLocation();
  const { data: locationStats } = useLocationStats(browsingLocation?.lat, browsingLocation?.lng);

  const displaySociety = effectiveSociety || society;
  const isViewingAs = viewAsSocietyId && (isAdmin || isBuilderMember);

  // Get initials for avatar
  const initials = profile?.name
    ? profile.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <>
      <header className={cn(
        'sticky top-0 z-40 bg-background border-b border-border',
        className
      )}>
        <div className="px-4 pt-[max(0.25rem,env(safe-area-inset-top))] pb-2">
          {/* Top row: always show branding + actions */}
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-extrabold tracking-tight leading-tight">
                <span className="text-[hsl(var(--primary))]">S</span>
                <span className="text-foreground">oci</span>
                <span className="text-[hsl(100,60%,45%)]">v</span>
                <span className="text-foreground">a</span>
              </h1>
              <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                {settings.headerTagline}
              </p>
              {displaySociety && (
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Building size={11} className="text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-semibold text-foreground truncate max-w-[40vw]">
                      {displaySociety.name}
                    </span>
                    {societyStats?.isVerified && (
                      <Verified size={12} className="text-primary shrink-0" />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <ThemeToggle className="h-9 w-9 rounded-full bg-secondary text-foreground border border-border hover:bg-muted" />
              {isBuilderMember && (
                <Link to="/builder">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                  >
                    <Building2 size={16} />
                  </Button>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                  >
                    <ShieldCheck size={16} />
                  </Button>
                </Link>
              )}
              {isSeller && (
                <Link to="/seller">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                  >
                    <Store size={16} />
                  </Button>
                </Link>
              )}
              {user && (
                <>
                  <Link to="/notifications/inbox">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="relative h-9 w-9 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                    >
                      <Bell size={16} />
                      {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-badge-new px-1 text-[9px] font-bold text-primary-foreground">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link to="/profile">
                    <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold cursor-pointer hover:opacity-90 transition-opacity">
                      {initials}
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Dynamic location stats chip — only on home (no title) */}
          {!title && (
            <button
              type="button"
              onClick={() => setLocationSheetOpen(true)}
              className="flex items-center gap-1.5 mt-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-colors max-w-full overflow-hidden"
            >
              <MapPin size={12} className="text-primary shrink-0" />
              {browsingLocation ? (
                <>
                  <span className="text-[11px] font-semibold text-foreground truncate">
                    {browsingLocation.source === 'gps' ? 'Near ' : ''}{browsingLocation.label}
                  </span>
                  {locationStats && (
                    <>
                      <span className="text-muted-foreground/40 shrink-0">·</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                        <Store size={9} className="text-primary/70 shrink-0" />
                        <span className="font-semibold">{locationStats.sellersNearby}</span> sellers
                      </span>
                      {locationStats.ordersToday > 0 && (
                        <>
                          <span className="text-muted-foreground/40 shrink-0">·</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            <span className="font-semibold">{locationStats.ordersToday}</span> orders today
                          </span>
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Set your location
                </span>
              )}
              <ChevronDown size={11} className="text-muted-foreground shrink-0 ml-auto" />
            </button>
          )}

          {/* Search bar - only on home (no title) */}
          {!title && (
            <Link to="/search" className="block mt-2">
              <div className="flex items-center gap-2.5 bg-secondary rounded-xl px-4 py-2.5 border border-border">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.3-4.3"/>
                </svg>
                <TypewriterPlaceholder context="home" />
              </div>
            </Link>
          )}
        </div>

        <LocationSelectorSheet open={locationSheetOpen} onOpenChange={setLocationSheetOpen} />

        {/* Breadcrumb bar - shown when title is present */}
        {title && (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-t border-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full shrink-0"
              onClick={handleBack}
            >
              <ArrowLeft size={14} />
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
              <span className="text-muted-foreground/50">›</span>
              <span className="font-semibold text-foreground truncate">{title}</span>
            </div>
          </div>
        )}
      </header>

      {isViewingAs && (
        <div className="sticky top-[120px] z-39 bg-warning/15 border-b border-warning/30 px-4 py-1.5 flex items-center justify-between">
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

// Fix #2: React.memo — Header only re-renders when its props change
export const Header = memo(HeaderInner);
