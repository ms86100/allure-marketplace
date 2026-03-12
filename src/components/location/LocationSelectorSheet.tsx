import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MapPin, Home, Briefcase, Tag, Building, Navigation, Loader2, Plus, Check, ArrowLeft } from 'lucide-react';
import { useDeliveryAddresses } from '@/hooks/useDeliveryAddresses';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowsingLocation, BrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { getCurrentPosition } from '@/lib/native-location';
import { loadGoogleMapsScript } from '@/hooks/useGoogleMaps';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface LocationSelectorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LABEL_ICONS: Record<string, typeof Home> = {
  Home, Work: Briefcase, Other: Tag,
};

export function LocationSelectorSheet({ open, onOpenChange }: LocationSelectorSheetProps) {
  const { addresses } = useDeliveryAddresses();
  const { society } = useAuth();
  const { browsingLocation, setBrowsingLocation, clearOverride } = useBrowsingLocation();
  const navigate = useNavigate();
  const [detectingGps, setDetectingGps] = useState(false);

  const handleSelectAddress = (addr: any) => {
    if (!addr.latitude || !addr.longitude) {
      toast.error('This address has no location coordinates');
      return;
    }
    setBrowsingLocation({
      id: addr.id,
      label: addr.building_name || addr.label || 'Saved address',
      lat: addr.latitude,
      lng: addr.longitude,
      source: 'address',
    });
    onOpenChange(false);
  };

  const handleUseSociety = () => {
    clearOverride();
    onOpenChange(false);
  };

  const handleUseGps = async () => {
    setDetectingGps(true);
    try {
      const pos = await getCurrentPosition();

      // Use Places API nearbySearch (which IS enabled) instead of Geocoder (which is NOT)
      let label = '';
      try {
        await loadGoogleMapsScript();
      } catch { /* proceed with fallback */ }

      if ((window as any).google?.maps?.places) {
        try {
          // Create a temporary hidden div for PlacesService
          const div = document.createElement('div');
          const service = new google.maps.places.PlacesService(div);
          const result = await new Promise<string>((resolve) => {
            service.nearbySearch(
              {
                location: { lat: pos.latitude, lng: pos.longitude },
                rankBy: google.maps.places.RankBy.DISTANCE,
                type: 'point_of_interest',
              },
              (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results?.[0]) {
                  resolve(results[0].name || results[0].vicinity || '');
                } else {
                  resolve('');
                }
              }
            );
          });
          if (result) label = result;
        } catch { /* fallback below */ }
      }

      // If Places API also failed, try to match against user's saved addresses
      if (!label) {
        const nearbyAddr = addresses.find(a =>
          a.latitude && a.longitude &&
          Math.abs(a.latitude - pos.latitude) < 0.005 &&
          Math.abs(a.longitude - pos.longitude) < 0.005
        );
        label = nearbyAddr?.building_name || nearbyAddr?.label || `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`;
      }

      setBrowsingLocation({
        id: 'gps',
        label,
        lat: pos.latitude,
        lng: pos.longitude,
        source: 'gps',
      });
      onOpenChange(false);
      toast.success(`Browsing near ${label}`);
    } catch {
      toast.error('Could not detect location. Please enable location access.');
    } finally {
      setDetectingGps(false);
    }
  };

  const handleAddAddress = () => {
    onOpenChange(false);
    navigate('/profile/edit');
  };

  const isSelected = (id: string) => browsingLocation?.id === id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base font-bold">Browse Near</SheetTitle>
        </SheetHeader>

        <div className="space-y-1.5">
          {/* GPS Option */}
          <button
            type="button"
            onClick={handleUseGps}
            disabled={detectingGps}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {detectingGps ? <Loader2 size={16} className="animate-spin text-primary" /> : <Navigation size={16} className="text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Use Current Location</p>
              <p className="text-[11px] text-muted-foreground">Detect via GPS</p>
            </div>
            {isSelected('gps') && <Check size={16} className="text-primary shrink-0" />}
          </button>

          {/* Saved Addresses */}
          {addresses.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">Saved Addresses</p>
              {addresses.map(addr => {
                const Icon = LABEL_ICONS[addr.label] || MapPin;
                return (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => handleSelectAddress(addr)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left mb-1.5"
                  >
                    <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{addr.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {addr.building_name || addr.full_address || `${addr.flat_number}, ${addr.block}`}
                      </p>
                    </div>
                    {isSelected(addr.id) && <Check size={16} className="text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Add Address */}
          <button
            type="button"
            onClick={handleAddAddress}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-primary/30 hover:bg-primary/5 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Plus size={16} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-primary">Add New Address</p>
          </button>

          {/* Society Default */}
          {society?.latitude && society?.longitude && (
            <button
              type="button"
              onClick={handleUseSociety}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
            >
              <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Building size={16} className="text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Society Default</p>
                <p className="text-[11px] text-muted-foreground truncate">{society.name}</p>
              </div>
              {browsingLocation?.source === 'society' && <Check size={16} className="text-primary shrink-0" />}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
