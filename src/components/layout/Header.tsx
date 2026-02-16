import { useState, useEffect } from 'react';
import { Bell, ChevronDown, User, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/hooks/useCart';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';

interface HeaderProps {
  showCart?: boolean;
  showLocation?: boolean;
  title?: string;
  className?: string;
}

export function Header({ 
  showCart = true, 
  showLocation = true, 
  title,
  className 
}: HeaderProps) {
  const { profile, isApproved, society, user, viewAsSocietyId, effectiveSociety, setViewAsSociety, isAdmin, isBuilderMember } = useAuth();
  const { itemCount } = useCart();
  const { selectionChanged } = useHaptics();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchUnread();

    const channel = supabase
      .channel('notification-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchUnread = async () => {
    if (!user) return;
    const { count } = await supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setUnreadCount(count || 0);
  };

  const displaySociety = effectiveSociety || society;
  const isViewingAs = viewAsSocietyId && (isAdmin || isBuilderMember);

  return (
    <>
      <header className={cn(
        'sticky top-0 z-40 safe-top bg-background',
        className
      )}>
        <div className="px-4 pt-3 pb-2">
          {/* Top row: delivery info + actions */}
          <div className="flex items-start justify-between">
            {showLocation && profile ? (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Sociva in</p>
                <p className="text-2xl font-extrabold text-foreground leading-tight tracking-tight">
                  16 minutes
                </p>
                <button 
                  className="flex items-center gap-1 mt-0.5"
                  onClick={() => selectionChanged()}
                >
                  <span className="text-xs font-semibold text-foreground">
                    HOME
                  </span>
                  <span className="text-xs text-muted-foreground">-</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {profile.block}, {profile.flat_number}
                  </span>
                  <ChevronDown size={12} className="text-muted-foreground shrink-0" />
                </button>
              </div>
            ) : title ? (
              <h1 className="text-lg font-bold text-foreground">{title}</h1>
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Sociva in</p>
                <p className="text-2xl font-extrabold text-foreground leading-tight">16 minutes</p>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1">
              <ThemeToggle className="h-10 w-10 rounded-full bg-muted text-foreground" />
              {isApproved && (
                <>
                  <Link to="/notifications/inbox">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="relative h-10 w-10 rounded-full bg-muted text-foreground"
                    >
                      <Bell size={18} />
                      {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link to="/profile">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 rounded-full bg-muted text-foreground"
                    >
                      <User size={18} />
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Search bar */}
          <Link to="/search" className="block mt-3">
            <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
              <span className="text-sm text-muted-foreground flex-1">Search "groceries"</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </div>
          </Link>
        </div>
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
