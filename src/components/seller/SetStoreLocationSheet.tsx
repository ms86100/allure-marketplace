import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleMapConfirm } from '@/components/auth/GoogleMapConfirm';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentPosition } from '@/lib/native-location';
import { useGoogleMaps, useAutocomplete } from '@/hooks/useGoogleMaps';
import { MapPin, Navigation, Loader2, Search, ArrowLeft, X } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const { predictions, isSearching, searchPlaces, getPlaceDetails, clearPredictions } = useAutocomplete();

  // Auto-focus input when pick overlay opens
  useEffect(() => {
    if (open && step === 'pick') {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open, step]);

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
      handleClose();
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

  const handleClose = () => {
    setStep('pick');
    setCoords(null);
    setSearchInput('');
    clearPredictions();
    onOpenChange(false);
  };

  if (!open) return null;

  // Step 1: Full-screen overlay for search (input at top, always visible above keyboard)
  if (step === 'pick') {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Top bar */}
        <div className="shrink-0 flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top,0px),12px)] pb-3 border-b border-border">
          <button
            onClick={handleClose}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <h2 className="text-base font-semibold text-foreground">Set Store Location</h2>
        </div>

        {/* Search input pinned below top bar */}
        <div className="shrink-0 px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search your store location or area..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-10 h-12 rounded-xl text-base"
              inputMode="search"
              autoComplete="off"
              enterKeyHint="search"
            />
            {searchInput && !isSearching && (
              <button
                onClick={() => { setSearchInput(''); clearPredictions(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
                aria-label="Clear"
              >
                <X size={16} className="text-muted-foreground" />
              </button>
            )}
            {isSearching && (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Scrollable results area */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          {/* Predictions list */}
          {predictions.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border mb-4">
              {predictions.map((p) => (
                <button
                  key={p.placeId}
                  onClick={() => handleSelectPlace(p.placeId)}
                  disabled={loading}
                  className="w-full text-left px-3 py-3 hover:bg-accent/50 active:bg-accent/70 transition-colors flex items-start gap-3"
                >
                  <MapPin size={16} className="text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.mainText}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.secondaryText}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Divider + GPS option */}
          {predictions.length === 0 && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Type an address to search, or use your current location
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 my-4">
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

          <p className="text-[10px] text-muted-foreground text-center mt-3">
            <MapPin size={10} className="inline mr-1" />
            Make sure you are at or near your store when using this option
          </p>
        </div>
      </div>,
      document.body,
    );
  }

  // Step 2: Drawer for map confirmation (no keyboard needed)
  return (
    <Drawer open={true} onOpenChange={(val) => { if (!val) handleBack(); }}>
      <DrawerContent className="max-h-[85vh] overflow-y-auto">
        <DrawerHeader className="pb-2 shrink-0">
          <DrawerTitle className="text-base">Confirm Location</DrawerTitle>
          <p className="text-xs text-muted-foreground">Drag the pin to adjust the exact location</p>
        </DrawerHeader>
        <div className="px-4 pb-6">
          {coords && mapsLoaded && (
            <GoogleMapConfirm
              latitude={coords.lat}
              longitude={coords.lng}
              name={selectedPlaceName || 'Store Location'}
              onConfirm={(lat, lng) => handleConfirm(lat, lng)}
              onBack={handleBack}
            />
          )}
          {coords && !mapsLoaded && (
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
