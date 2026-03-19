import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
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

/** Gap #2: Time-aware greeting from profile name */
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

  // Gap #2: Time-aware greeting
  const greeting = useMemo(() => getGreeting(profile?.name), [profile?.name]);

  // Gap #10: Recent search chips from sessionStorage
  const recentSearches = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('recent-searches');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    } catch { return []; }
  }, []);

  return (
    <>
      <header className={cn(
        'sticky top-0 z-40 bg-background border-b border-border',
        className
      )}>
        <div className="px-4 pt-[max(0.25rem,env(safe-area-inset-top))] pb-2">
          {/* Single compressed row: branding + greeting + actions */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[18px] font-extrabold tracking-tight leading-none">
                  <span className="text-[hsl(var(--primary))]">S</span>
                  <span className="text-foreground">oci</span>
                  <span className="text-[hsl(100,60%,45%)]">v</span>
                  <span className="text-foreground">a</span>
                </h1>
                <span className="text-muted-foreground/25">·</span>
                <span className="text-[10px] font-semibold text-muted-foreground truncate">
                  {greeting}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <ThemeToggle className="h-8 w-8 rounded-full bg-secondary text-foreground border border-border hover:bg-muted" />
              {isBuilderMember && (
                <Link to="/builder">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                  >
                    <Building2 size={14} />
                  </Button>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                  >
                    <ShieldCheck size={14} />
                  </Button>
                </Link>
              )}
              {isSeller && (
                <Link to="/seller">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                  >
                    <Store size={14} />
                  </Button>
                </Link>
              )}
              {user && (
                <>
                  <Link to="/notifications/inbox">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="relative h-8 w-8 rounded-full bg-secondary text-foreground border border-border hover:bg-muted"
                    >
                      <Bell size={14} />
                      {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-badge-new px-1 text-[9px] font-bold text-primary-foreground">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link to="/profile">
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[9px] font-bold cursor-pointer hover:opacity-90 transition-opacity">
                      {initials}
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Single row: location + search merged into one bar */}
          {!title && (
            <div className="flex items-center gap-2 mt-1.5">
              {/* Location chip — compact, tappable */}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setLocationSheetOpen(true); }}
                className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-colors"
              >
                <MapPin size={11} className="text-primary shrink-0" />
                <span className="text-[9px] font-semibold text-foreground max-w-[60px] truncate">
                  {browsingLocation ? browsingLocation.label : 'Location'}
                </span>
                <ChevronDown size={9} className="text-muted-foreground shrink-0" />
              </button>

              {/* Search bar — takes remaining space */}
              <Link to="/search" className="flex-1 min-w-0">
                <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-1.5 border border-border">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.3-4.3"/>
                  </svg>
                  <TypewriterPlaceholder context="home" />
                </div>
              </Link>
            </div>
          )}
        </div>

        <ActiveOrderETA />
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
