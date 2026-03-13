import { useState, useRef, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MapPin, Home, Briefcase, Tag, Building, Navigation, Loader2, Plus, Check, ArrowLeft } from 'lucide-react';
import { useDeliveryAddresses } from '@/hooks/useDeliveryAddresses';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowsingLocation, BrowsingLocation } from '@/contexts/BrowsingLocationContext';
import { getCurrentPosition } from '@/lib/native-location';
import { loadGoogleMapsScript } from '@/hooks/useGoogleMaps';
import { extractBestLabel, extractBestFormattedAddress, findNearbyPlaceName, pickBetterLabel } from '@/lib/location-label-resolver';
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
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [detectedLocation, setDetectedLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const detectedLocationRef = useRef(detectedLocation);
  detectedLocationRef.current = detectedLocation;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerInstanceRef = useRef<google.maps.Marker | null>(null);
  const mapInitializedRef = useRef(false);
  const [relocating, setRelocating] = useState(false);
  const geocodeRequestIdRef = useRef(0);
  const ignoreIdleUntilRef = useRef(0);
  const idleDebounceRef = useRef<number | null>(null);

  // Helper: reverse-geocode a position and return a label (uses Places fallback when geocoder is not POI-precise)
  const reverseGeocode = useCallback(async (lat: number, lng: number, preserveInitial = false): Promise<string> => {
    const requestId = ++geocodeRequestIdRef.current;
    let bestLabel = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
      const geocoder = new google.maps.Geocoder();
      const results = await new Promise<google.maps.GeocoderResult[] | null>((resolve) => {
        geocoder.geocode({ location: { lat, lng } }, (res, status) => {
          resolve(status === 'OK' && res ? res : null);
        });
      });

      let geocoderLabel = results ? extractBestLabel(results) : null;
      const bestAddress = results ? extractBestFormattedAddress(results) : null;

      // Try Places fallback for neighborhood/route-level labels and for manual pin moves.
      const shouldTryPlaces =
        !geocoderLabel ||
        geocoderLabel.quality <= 3 ||
        (!preserveInitial && geocoderLabel.quality === 4);

      if (shouldTryPlaces && mapInstanceRef.current) {
        const placesLabel = await findNearbyPlaceName(mapInstanceRef.current, lat, lng, { maxDistanceMeters: 45 });
        geocoderLabel = pickBetterLabel(geocoderLabel, placesLabel);
      }

      bestLabel = geocoderLabel?.name || bestAddress || bestLabel;
    } catch {
      // keep coordinate fallback
    }

    // Ignore stale geocode responses from older drag/idle events.
    if (requestId !== geocodeRequestIdRef.current) {
      return detectedLocationRef.current?.label || bestLabel;
    }

    return bestLabel;
  }, []);

  // Initialize map ONCE when entering confirm step
  useEffect(() => {
    if (step !== 'confirm' || !detectedLocation || !mapContainerRef.current) return;
    if (!(window as any).google?.maps) return;
    if (mapInitializedRef.current) return; // already initialized

    const map = new google.maps.Map(mapContainerRef.current, {
      center: { lat: detectedLocation.lat, lng: detectedLocation.lng },
      zoom: 17,
      maxZoom: 21,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'simplified' }] }],
    });

    mapInstanceRef.current = map;

    const marker = new google.maps.Marker({
      position: { lat: detectedLocation.lat, lng: detectedLocation.lng },
      map,
      draggable: true,
      animation: google.maps.Animation.DROP,
    });

    markerInstanceRef.current = marker;
    mapInitializedRef.current = true;

    const updateFromPosition = async (lat: number, lng: number, preserveInitial = false) => {
      const label = await reverseGeocode(lat, lng, preserveInitial);
      setDetectedLocation({ lat, lng, label });
    };

    // Reverse-geocode on pin drag
    const dragStartListener = marker.addListener('dragstart', () => {
      ignoreIdleUntilRef.current = Date.now() + 500;
    });

    const dragEndListener = marker.addListener('dragend', async () => {
      const pos = marker.getPosition();
      if (!pos) return;
      ignoreIdleUntilRef.current = Date.now() + 500;
      const lat = pos.lat();
      const lng = pos.lng();
      await updateFromPosition(lat, lng, false);
    });

    // Tap to place pin (mobile-friendly)
    const clickListener = map.addListener('click', async (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      ignoreIdleUntilRef.current = Date.now() + 500;
      marker.setPosition({ lat, lng });
      await updateFromPosition(lat, lng, false);
    });

    // Move pin to map center after pan/zoom idle for easier Zomato/Blinkit-style adjustment
    const idleListener = map.addListener('idle', () => {
      if (Date.now() < ignoreIdleUntilRef.current) return;
      if (idleDebounceRef.current) window.clearTimeout(idleDebounceRef.current);

      idleDebounceRef.current = window.setTimeout(async () => {
        const center = map.getCenter();
        if (!center) return;

        const centerLat = center.lat();
        const centerLng = center.lng();

        const currentPos = marker.getPosition();
        const currentLat = currentPos?.lat() ?? centerLat;
        const currentLng = currentPos?.lng() ?? centerLng;

        // Skip tiny map movement noise
        const moved = Math.abs(centerLat - currentLat) > 0.00001 || Math.abs(centerLng - currentLng) > 0.00001;
        if (!moved) return;

        marker.setPosition({ lat: centerLat, lng: centerLng });
        await updateFromPosition(centerLat, centerLng, false);
      }, 220);
    });

    return () => {
      dragStartListener.remove();
      dragEndListener.remove();
      clickListener.remove();
      idleListener.remove();
      if (idleDebounceRef.current) {
        window.clearTimeout(idleDebounceRef.current);
        idleDebounceRef.current = null;
      }
      marker.setMap(null);
    };
  }, [step, reverseGeocode]);
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

      let label = '';
      try {
        await loadGoogleMapsScript();
      } catch { /* proceed with fallback */ }

      // Use unified reverse geocoding (Geocoder + Places API fallback)
      if ((window as any).google?.maps) {
        try {
          label = await reverseGeocode(pos.latitude, pos.longitude);
          console.info('[LocationSelector] Resolved label:', label);
        } catch (err) {
          console.warn('[LocationSelector] Geocode error:', err);
        }
      }

      if (!label) {
        const nearbyAddr = addresses.find(a =>
          a.latitude && a.longitude &&
          Math.abs(a.latitude - pos.latitude) < 0.005 &&
          Math.abs(a.longitude - pos.longitude) < 0.005
        );
        label = nearbyAddr?.building_name || nearbyAddr?.label || `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`;
      }

      setDetectedLocation({ lat: pos.latitude, lng: pos.longitude, label });
      setStep('confirm');
    } catch {
      toast.error('Could not detect location. Please enable location access.');
    } finally {
      setDetectingGps(false);
    }
  };

  const handleConfirmGps = () => {
    if (!detectedLocation) return;
    setBrowsingLocation({
      id: 'gps',
      label: detectedLocation.label,
      lat: detectedLocation.lat,
      lng: detectedLocation.lng,
      source: 'gps',
    });
    onOpenChange(false);
    toast.success(`Browsing near ${detectedLocation.label}`);
  };

  const handleAddAddress = () => {
    onOpenChange(false);
    navigate('/profile/edit');
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setStep('pick');
      setDetectedLocation(null);
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
      mapInitializedRef.current = false;
    }
    onOpenChange(val);
  };

  const isSelected = (id: string) => browsingLocation?.id === id;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base font-bold">
            {step === 'confirm' ? 'Confirm Detected Location' : 'Browse Near'}
          </SheetTitle>
        </SheetHeader>

        {step === 'confirm' && detectedLocation ? (
          <div className="space-y-3">
            {/* Location label */}
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20">
              <MapPin size={14} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{detectedLocation.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {detectedLocation.lat.toFixed(5)}, {detectedLocation.lng.toFixed(5)}
                </p>
              </div>
            </div>

            {/* Map with "my location" button */}
            <div className="relative">
              <div ref={mapContainerRef} className="w-full h-64 sm:h-72 rounded-xl border border-border overflow-hidden bg-muted" />
              <button
                type="button"
                disabled={relocating}
                onClick={async () => {
                  setRelocating(true);
                  try {
                    const pos = await getCurrentPosition();
                    const newPos = { lat: pos.latitude, lng: pos.longitude };

                    mapInstanceRef.current?.panTo(newPos);
                    mapInstanceRef.current?.setZoom(17);
                    markerInstanceRef.current?.setPosition(newPos);

                    const label = await reverseGeocode(newPos.lat, newPos.lng);
                    setDetectedLocation({ ...newPos, label });
                  } catch {
                    toast.error('Could not get your location');
                  } finally {
                    setRelocating(false);
                  }
                }}
                className="absolute bottom-3 right-3 z-10 h-10 w-10 rounded-full bg-background border border-border shadow-lg flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Go to my location"
              >
                {relocating ? <Loader2 size={16} className="animate-spin text-primary" /> : <Navigation size={16} className="text-primary" />}
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              Drag/tap pin or move map to center it, then confirm this location.
            </p>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setStep('pick'); setDetectedLocation(null); }}
                className="flex-1 h-11 rounded-xl"
              >
                <ArrowLeft size={14} className="mr-1" /> Back
              </Button>
              <Button
                onClick={handleConfirmGps}
                className="flex-1 h-11 rounded-xl font-semibold"
              >
                <Check size={14} className="mr-1" /> Confirm
              </Button>
            </div>
          </div>
        ) : (
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
        )}
      </SheetContent>
    </Sheet>
  );
}
