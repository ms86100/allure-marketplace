// @ts-nocheck
/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Loader2, ArrowLeft } from 'lucide-react';
import {
  extractBestLabel,
  extractBestFormattedAddress,
  findNearbyPlaceName,
  pickBetterLabel,
  formatCoords,
  LabelQuality,
  type ResolvedLabel,
} from '@/lib/location-label-resolver';

interface GoogleMapConfirmProps {
  latitude: number;
  longitude: number;
  name: string;
  onConfirm: (lat: number, lng: number, updatedName?: string, formattedAddress?: string) => void;
  onBack: () => void;
}

function callerNameToLabel(name: string): ResolvedLabel | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const genericPlaceholders = ['store location', 'your location', 'location pinned'];
  if (genericPlaceholders.includes(trimmed.toLowerCase())) return null;
  return { name: trimmed, quality: LabelQuality.POI };
}

export function GoogleMapConfirm({ latitude, longitude, name, onConfirm, onBack }: GoogleMapConfirmProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const mapInitializedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const resolveRequestIdRef = useRef(0);
  const idleDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const ignoreIdleUntilRef = useRef(0);

  const [marker, setMarker] = useState<{ lat: number; lng: number }>({ lat: latitude, lng: longitude });
  const [displayName, setDisplayName] = useState(name);
  const [formattedAddress, setFormattedAddress] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const isPanningRef = useRef(false);
  const pinRef = useRef<HTMLDivElement>(null);
  const panningTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const displayNameRef = useRef(name);
  const formattedAddressRef = useRef('');
  const initialLabelRef = useRef<ResolvedLabel | null>(callerNameToLabel(name));

  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { formattedAddressRef.current = formattedAddress; }, [formattedAddress]);
  useEffect(() => {
    initialLabelRef.current = callerNameToLabel(name);
    if (name.trim()) setDisplayName(name);
  }, [name]);

  const resolveLabel = useCallback(async (lat: number, lng: number, preserveInitial: boolean) => {
    const requestId = ++resolveRequestIdRef.current;
    setIsGeocoding(true);

    let currentBest: ResolvedLabel | null = preserveInitial ? initialLabelRef.current : null;
    let bestAddress: string | null = null;

    try {
      const geocoder = geocoderRef.current;
      const map = mapInstanceRef.current;
      if (!geocoder) return;

      const geocodeResult = await new Promise<google.maps.GeocoderResult[] | null>((resolve) => {
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          resolve(status === 'OK' && results ? results : null);
        });
      });

      if (geocodeResult) {
        bestAddress = extractBestFormattedAddress(geocodeResult);
        const geocodeLabel = extractBestLabel(geocodeResult);
        currentBest = pickBetterLabel(currentBest, geocodeLabel);
      }

      const shouldTryPlaces =
        !currentBest ||
        currentBest.quality <= LabelQuality.Neighborhood ||
        (!preserveInitial && currentBest.quality === LabelQuality.Premise);

      if (shouldTryPlaces && map) {
        const placesLabel = await findNearbyPlaceName(map, lat, lng, { maxDistanceMeters: 45 });
        currentBest = pickBetterLabel(currentBest, placesLabel);
      }
    } catch (err) {
      console.warn('[GoogleMapConfirm] Label resolution error:', err);
    }

    if (requestId !== resolveRequestIdRef.current) return;

    if (!currentBest) currentBest = formatCoords(lat, lng);

    setDisplayName(currentBest.name);
    const finalAddress = bestAddress || currentBest.formattedAddress || '';
    setFormattedAddress(finalAddress);
    setIsGeocoding(false);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) {
      console.warn('GoogleMapConfirm: Google Maps not loaded');
      return;
    }
    if (mapInitializedRef.current) return;

    const initialPos = { lat: latitude, lng: longitude };

    const map = new google.maps.Map(mapRef.current, {
      center: initialPos,
      zoom: 17,
      maxZoom: 21,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'simplified' }] }],
    });

    mapInstanceRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
    mapInitializedRef.current = true;

    const setPanningActive = () => {
      if (panningTimeoutRef.current) clearTimeout(panningTimeoutRef.current);
      if (!isPanningRef.current) {
        isPanningRef.current = true;
        pinRef.current?.classList.add('is-panning');
      }
    };

    const setPanningInactive = () => {
      if (panningTimeoutRef.current) clearTimeout(panningTimeoutRef.current);
      panningTimeoutRef.current = setTimeout(() => {
        isPanningRef.current = false;
        pinRef.current?.classList.remove('is-panning');
      }, 300);
    };

    // Track user interaction start
    const dragStartListener = map.addListener('dragstart', () => {
      hasUserInteractedRef.current = true;
      setPanningActive();
    });

    const zoomListener = map.addListener('zoom_changed', () => {
      hasUserInteractedRef.current = true;
      setPanningActive();
    });

    // On idle: read center, reverse geocode
    ignoreIdleUntilRef.current = Date.now() + 800;
    const idleListener = map.addListener('idle', () => {
      setPanningInactive();
      if (Date.now() < ignoreIdleUntilRef.current) return;
      if (!hasUserInteractedRef.current) return;
      if (idleDebounceRef.current) clearTimeout(idleDebounceRef.current);
      idleDebounceRef.current = setTimeout(() => {
        const center = map.getCenter();
        if (!center) return;
        const newLat = center.lat();
        const newLng = center.lng();
        setMarker({ lat: newLat, lng: newLng });
        resolveLabel(newLat, newLng, false);
      }, 250);
    });

    // Initial resolve
    resolveLabel(latitude, longitude, true);

    return () => {
      dragStartListener.remove();
      zoomListener.remove();
      idleListener.remove();
      if (panningTimeoutRef.current) clearTimeout(panningTimeoutRef.current);
      if (idleDebounceRef.current) clearTimeout(idleDebounceRef.current);
      mapInstanceRef.current = null;
      geocoderRef.current = null;
      mapInitializedRef.current = false;
    };
  }, [resolveLabel]);

  // If parent updates coordinates, pan map
  useEffect(() => {
    if (!mapInstanceRef.current || !mapInitializedRef.current) return;
    const nextPos = { lat: latitude, lng: longitude };
    setMarker(nextPos);
    if (!hasUserInteractedRef.current) {
      mapInstanceRef.current.panTo(nextPos);
    }
    resolveLabel(latitude, longitude, true);
  }, [latitude, longitude, resolveLabel]);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ overscrollBehavior: 'contain' }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top,0px),12px)] pb-3 bg-background/95 backdrop-blur-sm z-10">
        <button
          onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h2 className="text-base font-semibold text-foreground">Confirm Location</h2>
      </div>

      {/* Map container — fills remaining space */}
      <div className="flex-1 relative" style={{ touchAction: 'none' }}>
        {/* Map */}
        <div ref={mapRef} className="absolute inset-0" />

        {/* CSS center pin overlay */}
        <div ref={pinRef} className="absolute left-1/2 top-1/2 -translate-x-1/2 pointer-events-none z-10 flex flex-col items-center map-pin-container">
          <div className="transition-transform duration-200 ease-out map-pin-icon">
            <MapPin
              size={40}
              className="text-primary drop-shadow-lg"
              fill="hsl(var(--primary))"
              strokeWidth={1.5}
              stroke="white"
            />
          </div>
          {/* Pin shadow dot */}
          <div className="w-2 h-1 rounded-full bg-black/30 -mt-1 transition-all duration-200 map-pin-shadow" />
        </div>

        {/* Instruction chip */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-background/90 backdrop-blur-sm text-xs text-muted-foreground px-3 py-1.5 rounded-full shadow-sm border border-border">
            Move the map to adjust location
          </div>
        </div>
      </div>

      {/* Bottom card */}
      <div className="shrink-0 bg-background border-t border-border px-4 pt-3 pb-[max(env(safe-area-inset-bottom,0px),16px)] space-y-3">
        {/* Location info */}
        <div className="flex items-start gap-2.5">
          <MapPin size={16} className="text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
            {formattedAddress && formattedAddress !== displayName && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{formattedAddress}</p>
            )}
          </div>
          {isGeocoding && <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0 mt-0.5" />}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} className="flex-1 h-12 rounded-xl">
            Back
          </Button>
          <Button
            onClick={() => onConfirm(marker.lat, marker.lng, displayNameRef.current, formattedAddressRef.current)}
            disabled={isGeocoding}
            className="flex-1 h-12 rounded-xl font-semibold"
          >
            {isGeocoding ? (
              <Loader2 size={16} className="mr-1 animate-spin" />
            ) : (
              <Check size={16} className="mr-1" />
            )}
            {isGeocoding ? 'Locating…' : 'Confirm Location'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
