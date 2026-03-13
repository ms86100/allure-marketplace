import { useState, useCallback, useMemo, type CSSProperties } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleMapConfirm } from '@/components/auth/GoogleMapConfirm';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentPosition } from '@/lib/native-location';
import { useGoogleMaps, useAutocomplete } from '@/hooks/useGoogleMaps';
import { useKeyboardViewport } from '@/hooks/useChatViewport';
import { MapPin, Navigation, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

interface SetStoreLocationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  onSuccess?: () => void;
}

export function SetStoreLocationSheet({ open, onOpenChange, sellerId, onSuccess }: SetStoreLocationSheetProps) {
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const queryClient = useQueryClient();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const { predictions, isSearching, searchPlaces, getPlaceDetails, clearPredictions } = useAutocomplete();
  const { viewportHeight, viewportTop, keyboardInset } = useKeyboardViewport(open);

  const effectiveViewportHeight = useMemo(
    () => Math.max(320, viewportHeight - keyboardInset),
    [viewportHeight, keyboardInset],
  );

  const sheetHeight = useMemo(
    () => Math.max(360, Math.min(Math.round(effectiveViewportHeight * 0.86), 760)),
    [effectiveViewportHeight],
  );

  const sheetTop = useMemo(
    () => viewportTop + Math.max(0, effectiveViewportHeight - sheetHeight),
    [viewportTop, effectiveViewportHeight, sheetHeight],
  );

  const dropdownMaxHeight = useMemo(
    () => Math.max(140, Math.min(280, Math.round(effectiveViewportHeight * 0.34))),
    [effectiveViewportHeight],
  );

  const drawerStyle: CSSProperties = {
    top: sheetTop,
    bottom: 'auto',
    height: sheetHeight,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  };

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    searchPlaces(value);
  }, [searchPlaces]);

  const handleSelectPlace = useCallback(async (placeId: string) => {
    setLoading(true);
    clearPredictions();
    setSearchInput('');
    try {
      const details = await getPlaceDetails(placeId);
      if (details && details.latitude && details.longitude) {
        setCoords({ lat: details.latitude, lng: details.longitude });
        setSelectedPlaceName(details.name || details.formattedAddress || '');
        setStep('confirm');
      } else {
        toast.error('Could not get location details. Try another place.');
      }
    } catch {
      toast.error('Failed to fetch place details.');
    } finally {
      setLoading(false);
    }
  }, [getPlaceDetails, clearPredictions]);

  const handleUseCurrentLocation = async () => {
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      setCoords({ lat: pos.latitude, lng: pos.longitude });
      setSelectedPlaceName('');
      setStep('confirm');
    } catch {
      toast.error('Could not get your location. Please allow location access and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (lat: number, lng: number) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_my_store_coordinates', {
        p_lat: lat,
        p_lng: lng,
        p_source: 'manual',
      } as any);
      if (error) throw error;
      toast.success('Store location set successfully!');
      queryClient.invalidateQueries({ queryKey: ['seller-health', sellerId] });
      queryClient.invalidateQueries({ queryKey: ['seller-profile'] });
      queryClient.invalidateQueries({ queryKey: ['seller-settings'] });
      onSuccess?.();
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
      setSearchInput('');
      clearPredictions();
    }
    onOpenChange(val);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} repositionInputs={false}>
      <DrawerContent className="mt-0 overflow-hidden flex flex-col" style={drawerStyle}>
        <DrawerHeader className="pb-2 shrink-0">
          <DrawerTitle className="text-base">Set Store Location</DrawerTitle>
          <p className="text-xs text-muted-foreground">
            {step === 'pick' ? 'Search for your store location or use GPS' : 'Drag the pin to adjust the exact location'}
          </p>
        </DrawerHeader>

        <div className="px-4 pb-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {step === 'pick' && (
            <div className="space-y-3 pb-2">
              <div className="sticky top-0 z-20 bg-background pb-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search your store location or area..."
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9 h-12 rounded-xl"
                    inputMode="search"
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                  {isSearching && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}

                  {predictions.length > 0 && (
                    <div
                      className="absolute left-0 right-0 top-full mt-2 z-30 border border-border rounded-xl overflow-hidden divide-y divide-border bg-card shadow-lg overflow-y-auto overscroll-contain"
                      style={{ maxHeight: `${dropdownMaxHeight}px` }}
                    >
                      {predictions.map((p) => (
                        <button
                          key={p.placeId}
                          onClick={() => handleSelectPlace(p.placeId)}
                          disabled={loading}
                          className="w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors flex items-start gap-2.5"
                        >
                          <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.mainText}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{p.secondaryText}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <Button
                variant="outline"
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
                Make sure you are at or near your store when using this option
              </p>
            </div>
          )}

          {step === 'confirm' && coords && mapsLoaded && (
            <GoogleMapConfirm
              latitude={coords.lat}
              longitude={coords.lng}
              name={selectedPlaceName || 'Store Location'}
              onConfirm={(lat, lng) => handleConfirm(lat, lng)}
              onBack={handleBack}
            />
          )}

          {step === 'confirm' && coords && !mapsLoaded && (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading map…</div>
          )}

          {saving && (
            <div className="pt-3 text-center text-xs text-muted-foreground">Saving location…</div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
