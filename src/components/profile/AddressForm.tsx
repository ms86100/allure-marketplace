import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Navigation, Loader2, Home, Briefcase, Tag } from 'lucide-react';
import { getCurrentPosition } from '@/lib/native-location';
import { GoogleMapConfirm } from '@/components/auth/GoogleMapConfirm';
import { toast } from 'sonner';

interface AddressData {
  id?: string;
  label: string;
  flat_number: string;
  block: string;
  floor: string;
  building_name: string;
  landmark: string;
  full_address: string;
  latitude: number | null;
  longitude: number | null;
  pincode: string;
  is_default: boolean;
}

interface AddressFormProps {
  initial?: Partial<AddressData>;
  onSave: (data: AddressData) => void;
  onCancel: () => void;
  saving?: boolean;
}

const LABEL_OPTIONS = [
  { value: 'Home', icon: Home },
  { value: 'Work', icon: Briefcase },
  { value: 'Other', icon: Tag },
];

export function AddressForm({ initial, onSave, onCancel, saving }: AddressFormProps) {
  const [form, setForm] = useState<AddressData>({
    id: initial?.id,
    label: initial?.label || 'Home',
    flat_number: initial?.flat_number || '',
    block: initial?.block || '',
    floor: initial?.floor || '',
    building_name: initial?.building_name || '',
    landmark: initial?.landmark || '',
    full_address: initial?.full_address || '',
    latitude: initial?.latitude ?? null,
    longitude: initial?.longitude ?? null,
    pincode: initial?.pincode || '',
    is_default: initial?.is_default ?? false,
  });
  const [detecting, setDetecting] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const update = (key: keyof AddressData, value: any) => setForm(f => ({ ...f, [key]: value }));

  const detectLocation = async () => {
    setDetecting(true);
    try {
      const pos = await getCurrentPosition();
      update('latitude', pos.latitude);
      update('longitude', pos.longitude);
      setShowMap(true);

      // Reverse geocode
      if ((window as any).google?.maps) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat: pos.latitude, lng: pos.longitude } }, (results, status) => {
          if (status === 'OK' && results?.[0]) {
            const r = results[0];
            const pincode = r.address_components?.find(c => c.types.includes('postal_code'))?.long_name || '';
            setForm(f => ({ ...f, full_address: r.formatted_address, pincode: pincode || f.pincode }));
          }
        });
      }
    } catch (err: any) {
      toast.error('Could not detect location. Please enable location access.');
    } finally {
      setDetecting(false);
    }
  };

  const handleMapConfirm = (lat: number, lng: number, name?: string) => {
    setForm(f => ({ ...f, latitude: lat, longitude: lng, full_address: name || f.full_address }));
    setShowMap(false);
  };

  const handleSubmit = () => {
    if (!form.flat_number.trim()) {
      toast.error('Please enter your flat/house number');
      return;
    }
    onSave(form);
  };

  if (showMap && form.latitude && form.longitude) {
    return (
      <GoogleMapConfirm
        latitude={form.latitude}
        longitude={form.longitude}
        name={form.full_address || form.building_name || 'Your location'}
        onConfirm={handleMapConfirm}
        onBack={() => setShowMap(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Label Chips */}
      <div>
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Address Label</Label>
        <div className="flex gap-2 mt-1.5">
          {LABEL_OPTIONS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => update('label', value)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                form.label === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/30'
              }`}
            >
              <Icon size={14} />
              {value}
            </button>
          ))}
        </div>
      </div>

      {/* GPS Detect */}
      <Button
        variant="outline"
        className="w-full h-11 rounded-xl border-dashed border-primary/30 text-primary"
        onClick={detectLocation}
        disabled={detecting}
      >
        {detecting ? (
          <><Loader2 size={16} className="mr-2 animate-spin" /> Detecting location…</>
        ) : (
          <><Navigation size={16} className="mr-2" /> Use current location</>
        )}
      </Button>

      {form.latitude && (
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="w-full flex items-center gap-2 p-2.5 bg-primary/5 rounded-xl border border-primary/20 text-sm"
        >
          <MapPin size={14} className="text-primary shrink-0" />
          <span className="flex-1 text-left truncate text-xs">{form.full_address || 'Location pinned'}</span>
          <span className="text-xs text-primary font-medium shrink-0">Adjust</span>
        </button>
      )}

      {/* Structured Fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="flat" className="text-xs">Flat / House No. *</Label>
          <Input id="flat" value={form.flat_number} onChange={e => update('flat_number', e.target.value)} placeholder="e.g. A-201" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="floor" className="text-xs">Floor</Label>
          <Input id="floor" value={form.floor} onChange={e => update('floor', e.target.value)} placeholder="e.g. 2nd" className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="block" className="text-xs">Block / Tower</Label>
          <Input id="block" value={form.block} onChange={e => update('block', e.target.value)} placeholder="e.g. B" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="pincode" className="text-xs">Pincode</Label>
          <Input id="pincode" value={form.pincode} onChange={e => update('pincode', e.target.value)} placeholder="e.g. 400001" className="mt-1" maxLength={6} />
        </div>
      </div>

      <div>
        <Label htmlFor="building" className="text-xs">Building / Society Name</Label>
        <Input id="building" value={form.building_name} onChange={e => update('building_name', e.target.value)} placeholder="e.g. Sunshine Residency" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="landmark" className="text-xs">Landmark</Label>
        <Input id="landmark" value={form.landmark} onChange={e => update('landmark', e.target.value)} placeholder="e.g. Near Central Park" className="mt-1" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1 h-11 rounded-xl">Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving} className="flex-1 h-11 rounded-xl font-semibold">
          {saving ? <Loader2 size={16} className="mr-1 animate-spin" /> : null}
          {form.id ? 'Update Address' : 'Save Address'}
        </Button>
      </div>
    </div>
  );
}
