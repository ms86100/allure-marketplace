import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { FloatingCartBar } from '@/components/cart/FloatingCartBar';
import { NavigatorBackButton } from '@/components/admin/NavigatorBackButton';
import { EnableNotificationsBanner } from '@/components/notifications/EnableNotificationsBanner';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  showNav?: boolean;
  showCart?: boolean;
  showLocation?: boolean;
  showBack?: boolean;
  headerTitle?: string;
  className?: string;
}

export function AppLayout({
  children,
  showHeader = true,
  showNav = true,
  showCart = true,
  showLocation = true,
  showBack,
  headerTitle,
  className,
}: AppLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-background max-w-md mx-auto relative shadow-[0_0_80px_-20px_hsl(var(--primary)/0.08)]">
      {showHeader && (
        <Header 
          showCart={showCart} 
          showLocation={showLocation}
          showBack={showBack}
          title={headerTitle} 
        />
      )}
      <main className={cn('pb-24', className)}>
        <EnableNotificationsBanner />
        {children}
      </main>
      <NavigatorBackButton />
      {showCart && <FloatingCartBar />}
      {showNav && <BottomNav />}
    </div>
  );
}
