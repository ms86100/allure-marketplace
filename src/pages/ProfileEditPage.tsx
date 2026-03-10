import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AddressForm } from '@/components/profile/AddressForm';
import { AddressCard } from '@/components/profile/AddressCard';
import { useAuth } from '@/contexts/AuthContext';
import { useDeliveryAddresses } from '@/hooks/useDeliveryAddresses';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Loader2, MapPin, Phone, User } from 'lucide-react';
import { useRef } from 'react';

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { user, profile, society, refreshProfile } = useAuth();
  const { addresses, isLoading: addressesLoading, saveAddress, deleteAddress, setDefault, isSaving } = useDeliveryAddresses();

  const [name, setName] = useState(
    profile?.name && profile.name !== 'User' ? profile.name : ''
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);

  // Auto-open address form if no addresses exist
  const shouldAutoOpen = !addressesLoading && addresses.length === 0 && !showAddressForm;

  const handleSaveProfile = async () => {
    if (!user || !name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').update({
        name: name.trim(),
      }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAddress = async (data: any) => {
    const payload = {
      ...data,
      society_id: profile?.society_id || null,
    };

    await saveAddress(payload);

    // Sync flat_number and block back to profile
    if (user && (data.flat_number || data.block)) {
      try {
        await supabase.from('profiles').update({
          flat_number: data.flat_number || '',
          block: data.block || '',
          phase: data.phase || null,
        }).eq('id', user.id);
        await refreshProfile();
      } catch {
        // Non-critical — don't block address save
      }
    }

    setShowAddressForm(false);
    setEditingAddress(null);
  };

  const handleEditAddress = (addr: any) => {
    setEditingAddress(addr);
    setShowAddressForm(true);
  };

  const handleAddNew = () => {
    const defaults: any = {};
    if (society) {
      defaults.building_name = society.name;
      if (society.latitude) defaults.latitude = society.latitude;
      if (society.longitude) defaults.longitude = society.longitude;
      if (society.pincode) defaults.pincode = society.pincode;
    }
    setEditingAddress(Object.keys(defaults).length > 0 ? defaults : null);
    setShowAddressForm(true);
  };

  return (
    <AppLayout headerTitle="Edit Profile" showNav={false}>
      <div className="pb-8">
        {/* Back */}
        <div className="px-4 pt-3">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        {/* ═══ SECTION 1: DELIVERY ADDRESS (TOP PRIORITY) ═══ */}
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Delivery Address</h3>
            {!showAddressForm && !shouldAutoOpen && addresses.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={handleAddNew}>
                <Plus size={14} className="mr-1" /> Add New
              </Button>
            )}
          </div>

          {showAddressForm || shouldAutoOpen ? (
            <AddressForm
              initial={editingAddress || undefined}
              onSave={handleSaveAddress}
              onCancel={() => { setShowAddressForm(false); setEditingAddress(null); }}
              saving={isSaving}
            />
          ) : addressesLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : addresses.length === 0 ? (
            <div className="text-center py-8 bg-muted/30 rounded-xl border border-dashed border-border">
              <MapPin size={24} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No delivery addresses yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add one for faster checkout</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleAddNew}>
                <Plus size={14} className="mr-1" /> Add Address
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {addresses.map(addr => (
                <AddressCard
                  key={addr.id}
                  address={addr as any}
                  onEdit={handleEditAddress}
                  onDelete={deleteAddress}
                  onSetDefault={setDefault}
                />
              ))}
            </div>
          )}
        </div>

        {/* ═══ SECTION 2: YOUR NAME ═══ */}
        <div className="px-4 mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Your Details</h3>
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            {/* Name */}
            <div>
              <Label htmlFor="name" className="text-xs text-muted-foreground flex items-center gap-1.5">
                <User size={12} /> Full Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your full name"
                className="mt-1.5"
              />
            </div>

            {/* Phone (read-only) */}
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone size={12} /> Phone
              </Label>
              <Input value={profile?.phone || user?.phone || ''} disabled className="mt-1.5 bg-muted/50" />
            </div>

            <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full h-11 rounded-xl font-semibold">
              {savingProfile ? <Loader2 size={16} className="mr-1 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
