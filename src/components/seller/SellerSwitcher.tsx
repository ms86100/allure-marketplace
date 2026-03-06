import { useAuth } from '@/contexts/AuthContext';
import { SellerProfile } from '@/types/database';
import { ChevronDown, Store, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SellerSwitcher({ compact = false }: { compact?: boolean }) {
  const { sellerProfiles, currentSellerId, setCurrentSellerId } = useAuth();

  if (sellerProfiles.length === 0) {
    return null;
  }

  const currentSeller = sellerProfiles.find((s) => s.id === currentSellerId);

  // If only one seller, just show the name without dropdown
  if (sellerProfiles.length === 1) {
    if (compact) return null;
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
        <Store size={16} className="text-muted-foreground" />
        <span className="font-medium text-sm truncate max-w-[150px]">
          {currentSeller?.business_name || 'Your Business'}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 max-w-[200px]">
          <Store size={16} />
          <span className="truncate">{currentSeller?.business_name || 'Select Business'}</span>
          <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {sellerProfiles.map((seller) => (
          <DropdownMenuItem
            key={seller.id}
            onClick={() => setCurrentSellerId(seller.id)}
            className={cn(
              'flex items-center gap-2 cursor-pointer',
              seller.id === currentSellerId && 'bg-primary/10'
            )}
          >
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                seller.verification_status === 'approved'
                  ? 'bg-success'
                  : seller.verification_status === 'pending'
                  ? 'bg-warning'
                  : 'bg-destructive'
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{seller.business_name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {seller.primary_group?.replace('_', ' ') || 'General'}
              </p>
            </div>
            {seller.id === currentSellerId && (
              <span className="text-xs text-primary">Active</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/become-seller" className="flex items-center gap-2 text-primary cursor-pointer">
            <Plus size={16} />
            <span>Add Another Business</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
