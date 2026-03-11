import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { GoogleMapConfirm } from '@/components/auth/GoogleMapConfirm';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentPosition } from '@/lib/native-location';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SetSocietyLocationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
}

export function SetSocietyLocationSheet({ open, onOpenChange, sellerId }: SetSocietyLocationSheetProps) {
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { isLoaded: mapsLoaded } = useGoogleMaps();

  const handleUseCurrentLocation = async () => {
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      setCoords({ lat: pos.latitude, lng: pos.longitude });
      setStep('confirm');
    } catch (err: any) {
      toast.error('Could not get your location. Please allow location access and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (lat: number, lng: number) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_my_society_coordinates', {
        p_lat: lat,
        p_lng: lng,
      } as any);
      if (error) throw error;
      toast.success('Society location set successfully!');
      queryClient.invalidateQueries({ queryKey: ['seller-health', sellerId] });
      onOpenChange(false);
      setStep('pick');
      setCoords(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setStep('pick');
    setCoords(null);
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setStep('pick');
      setCoords(null);
    }
    onOpenChange(val);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-base">Set Society Location</DrawerTitle>
          <p className="text-xs text-muted-foreground">
            {step === 'pick' ? 'Choose how to set your society\'s coordinates' : 'Drag the pin to adjust the exact location'}
          </p>
        </DrawerHeader>
        <div className="px-4 pb-6">
          {step === 'pick' && (
            <div className="space-y-3">
              <Button
                onClick={handleUseCurrentLocation}
                disabled={loading}
                className="w-full h-12 rounded-xl font-semibold"
              >
                {loading ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <Navigation size={16} className="mr-2" />
                )}
                Use Current Location
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                <MapPin size={10} className="inline mr-1" />
                Make sure you are at or near your society when using this option
              </p>
            </div>
          )}

          {step === 'confirm' && coords && mapsLoaded && (
            <GoogleMapConfirm
              latitude={coords.lat}
              longitude={coords.lng}
              name="Society Location"
              onConfirm={(lat, lng) => handleConfirm(lat, lng)}
              onBack={handleBack}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
