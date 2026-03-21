import { Switch } from '@/components/ui/switch';
import { SellerSwitcher } from '@/components/seller/SellerSwitcher';
import { SellerProfile } from '@/types/database';
import { Clock, Store, CheckCircle2, XCircle, FileEdit } from 'lucide-react';

interface StoreStatusCardProps {
  sellerProfile: SellerProfile;
  sellerProfiles: SellerProfile[];
  onToggleAvailability: () => void;
}

export function StoreStatusCard({ sellerProfile, sellerProfiles, onToggleAvailability }: StoreStatusCardProps) {
  const status = sellerProfile.verification_status;

  // Pending
  if (status === 'pending') {
    return (
      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Clock className="text-warning" size={24} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Verification Pending</h3>
              {sellerProfiles.length > 1 && <SellerSwitcher />}
            </div>
            <p className="text-sm text-muted-foreground">
              {sellerProfile.business_name} is being reviewed by admin
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Rejected
  if (status === 'rejected') {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <XCircle className="text-destructive" size={24} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-destructive">Store Rejected</h3>
              {sellerProfiles.length > 1 && <SellerSwitcher />}
            </div>
            <p className="text-sm text-muted-foreground">
              {sellerProfile.business_name} was not approved. Please update and resubmit.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Draft
  if (status === 'draft') {
    return (
      <div className="bg-muted border border-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <FileEdit className="text-muted-foreground" size={24} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Store Draft</h3>
              {sellerProfiles.length > 1 && <SellerSwitcher />}
            </div>
            <p className="text-sm text-muted-foreground">
              {sellerProfile.business_name} is still in draft. Complete setup and submit for review.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Suspended
  if (status === 'suspended') {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <XCircle className="text-destructive" size={24} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-destructive">Store Suspended</h3>
              {sellerProfiles.length > 1 && <SellerSwitcher />}
            </div>
            <p className="text-sm text-muted-foreground">
              {sellerProfile.business_name} has been suspended. Contact support for details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Approved — show live card with toggle
  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="text-primary" size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{sellerProfile.business_name}</h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                <CheckCircle2 size={12} />
                Store is live
              </span>
              <span className="text-xs text-muted-foreground">
                •{' '}{sellerProfile.is_available ? '🟢 Open' : '🔴 Closed'}
              </span>
              {sellerProfiles.length > 1 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {sellerProfiles.length} businesses
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sellerProfiles.length > 1 && <SellerSwitcher compact />}
          <Switch
            checked={sellerProfile.is_available}
            onCheckedChange={onToggleAvailability}
          />
        </div>
      </div>
    </div>
  );
}
