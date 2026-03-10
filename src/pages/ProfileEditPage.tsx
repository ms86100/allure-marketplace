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
import { ArrowLeft, Plus, Loader2, MapPin, Building2, Phone, User } from 'lucide-react';

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { user, profile, society, refreshProfile } = useAuth();
  const { addresses, isLoading: addressesLoading, saveAddress, deleteAddress, setDefault, isSaving } = useDeliveryAddresses();

  const [name, setName] = useState(profile?.name || '');
  const [flatNumber, setFlatNumber] = useState(profile?.flat_number || '');
  const [block, setBlock] = useState(profile?.block || '');
  const [phase, setPhase] = useState(profile?.phase || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);

  const handleSaveProfile = async () => {
    if (!user || !name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').update({
        name: name.trim(),
        flat_number: flatNumber.trim(),
        block: block.trim(),
        phase: phase.trim() || null,
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
    setShowAddressForm(false);
    setEditingAddress(null);
  };

  const handleEditAddress = (addr: any) => {
    setEditingAddress(addr);
    setShowAddressForm(true);
  };

  const handleAddNew = () => {
    // Smart defaults from society
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

        {/* ═══ SECTION 1: YOUR DETAILS ═══ */}
        <div className="px-4 mt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Your Details</h3>
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            {/* Name */}
            <div>
              <Label htmlFor="name" className="text-xs text-muted-foreground flex items-center gap-1.5">
                <User size={12} /> Full Name
              </Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="mt-1.5" />
            </div>

            {/* Phone (read-only) */}
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone size={12} /> Phone
              </Label>
              <Input value={profile?.phone || user?.phone || ''} disabled className="mt-1.5 bg-muted/50" />
            </div>

            {/* Society (read-only chip) */}
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Building2 size={12} /> Society
              </Label>
              {society ? (
                <div className="mt-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15 text-sm font-medium text-foreground">
                  <Building2 size={14} className="text-primary" />
                  {society.name}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Society will be assigned based on your delivery address
                </p>
              )}
            </div>

            {/* Unit details */}
            <div className="pt-1 border-t border-border/50">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Your Unit</p>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <Label htmlFor="flat" className="text-xs">Flat No.</Label>
                  <Input id="flat" value={flatNumber} onChange={e => setFlatNumber(e.target.value)} placeholder="A-201" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="block" className="text-xs">Block</Label>
                  <Input id="block" value={block} onChange={e => setBlock(e.target.value)} placeholder="B" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phase" className="text-xs">Phase</Label>
                  <Input id="phase" value={phase} onChange={e => setPhase(e.target.value)} placeholder="Phase 2" className="mt-1" />
                </div>
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full h-11 rounded-xl font-semibold">
              {savingProfile ? <Loader2 size={16} className="mr-1 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>

        {/* ═══ SECTION 2: DELIVERY ADDRESSES ═══ */}
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Delivery Addresses</h3>
            {!showAddressForm && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={handleAddNew}>
                <Plus size={14} className="mr-1" /> Add New
              </Button>
            )}
          </div>

          {showAddressForm ? (
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
      </div>
    </AppLayout>
  );
}
