// @ts-nocheck
import { useState, useCallback, memo, useMemo } from 'react';
import { ArrowLeft, Bell, Building2, ShieldCheck, Store, MapPin, ChevronDown, Search } from 'lucide-react';
import { motion } from 'framer-motion';

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/contexts/AuthContext';
import appIcon from '@/assets/sociva_app_icon.png';
import { useCartCount } from '@/hooks/useCartCount';
import { cn } from '@/lib/utils';
import { TypewriterPlaceholder } from '@/components/search/TypewriterPlaceholder';
import { useImmediateNavigate } from '@/hooks/useImmediateNavigate';

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

function getGreeting(name?: string | null, _hourKey?: number): string {
  // Use IST for greeting regardless of device timezone
  const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
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
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const navigateImmediately = useImmediateNavigate('Header');

  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/society');
    }
  }, [navigate]);

  const handleRouteNav = useCallback((to: string) => {
    navigateImmediately(to);
  }, [navigateImmediately]);

  const { profile, society, user, viewAsSocietyId, effectiveSociety, effectiveSocietyId, setViewAsSociety, isAdmin, isBuilderMember, isSeller } = useAuth();
  const itemCount = useCartCount();
  const unreadCount = useUnreadNotificationCount();
  const { browsingLocation } = useBrowsingLocation();

  const displaySociety = effectiveSociety || society;
  const isViewingAs = viewAsSocietyId && (isAdmin || isBuilderMember);

  const initials = profile?.name
    ? profile.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  // Include hour key so greeting updates when the hour changes (on re-render/navigation)
  const hourKey = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
  const greeting = useMemo(() => getGreeting(profile?.name, hourKey), [profile?.name, hourKey]);

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={cn(
        'sticky top-0 z-40 bg-[hsl(var(--header-bg))] backdrop-blur-2xl backdrop-saturate-150 border-b border-[hsl(var(--nav-border))]',
        className
      )}>
        <div className="px-4 pt-[max(env(safe-area-inset-top,0px),0.75rem)] pb-2 space-y-1">
          {/* Brand + tagline */}
          <div className="flex items-center gap-2.5 overflow-visible py-0.5">
            <img src={appIcon} alt="Sociva" className="w-10 h-10 rounded-xl object-cover ring-2 ring-primary/40 shadow-md shadow-primary/20 shrink-0" />
            <div>
              <h1 className="text-lg font-black text-foreground tracking-tight leading-tight italic"><span className="text-primary">S</span>oci<span className="text-primary">v</span>a</h1>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest leading-none mt-0.5">Your society, your store</p>
            </div>
          </div>

          {/* Location row with stats */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              {!title ? (
                <button
                  type="button"
                  onClick={() => setLocationSheetOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 border border-border/60 px-3 py-1.5 group active:scale-[0.98] transition-transform"
                >
                  <MapPin size={13} className="text-primary shrink-0" />
                  <span className="text-[12px] font-semibold text-foreground truncate max-w-[48vw] min-[375px]:max-w-[52vw] sm:max-w-[50vw]">
                    {browsingLocation?.label || displaySociety?.name || 'Set location'}
                  </span>
                  <ChevronDown size={12} className="text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-full shrink-0"
                    onClick={handleBack}
                  >
                    <ArrowLeft size={20} />
                  </Button>
                  <span className="text-base font-bold text-foreground truncate">{title}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <span className="hidden sm:inline-flex"><ThemeToggle /></span>
              {isBuilderMember && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleRouteNav('/builder')}>
                  <Building2 size={16} />
                </Button>
              )}
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleRouteNav('/admin')}>
                  <ShieldCheck size={16} />
                </Button>
              )}
              {isSeller && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleRouteNav('/seller')}>
                  <Store size={16} />
                </Button>
              )}
              {user && (
                <>
                  <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full" onClick={() => handleRouteNav('/notifications/inbox')}>
                    <Bell size={16} />
                    {unreadCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleRouteNav('/profile')}
                    className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[11px] font-bold cursor-pointer hover:opacity-90 transition-opacity"
                    aria-label="Open profile"
                  >
                    {initials}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Row 2: Search bar — only on home */}
          {!title && (
            <button type="button" onClick={() => handleRouteNav('/search')} className="block mt-2 w-full text-left">
              <div className="flex items-center gap-3 bg-[hsl(var(--search-bg))] border border-[hsl(var(--search-border))] rounded-full px-4 py-3 backdrop-blur-lg backdrop-saturate-150 transition-all hover:border-primary/30 hover:shadow-sm">
                <Search size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <TypewriterPlaceholder context="home" />
                </div>
              </div>
            </button>
          )}
        </div>

        
        <LocationSelectorSheet open={locationSheetOpen} onOpenChange={setLocationSheetOpen} />
      </motion.header>

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
