/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Loader2 } from 'lucide-react';
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
  /** Initial name from the caller (e.g. selected autocomplete result). */
  name: string;
  /** Called with lat, lng, display label, and full formatted address */
  onConfirm: (lat: number, lng: number, updatedName?: string, formattedAddress?: string) => void;
  onBack: () => void;
}

/** Check if a caller-provided name is a meaningful initial label. */
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
  const markerInstanceRef = useRef<google.maps.Marker | null>(null);
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

      // Try Places fallback for non-POI outcomes so pinned businesses are captured reliably.
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

  // Initialize map once per mount; do not recreate on each render.
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

    const pin = new google.maps.Marker({
      position: initialPos,
      map,
      draggable: true,
      title: 'Adjust your location',
      animation: google.maps.Animation.DROP,
    });

    mapInstanceRef.current = map;
    markerInstanceRef.current = pin;
    geocoderRef.current = new google.maps.Geocoder();
    mapInitializedRef.current = true;

    const dragEndListener = pin.addListener('dragend', () => {
      const pos = pin.getPosition();
      if (!pos) return;
      hasUserInteractedRef.current = true;
      const newLat = pos.lat();
      const newLng = pos.lng();
      setMarker({ lat: newLat, lng: newLng });
      resolveLabel(newLat, newLng, false);
    });

    // Allow tap-to-place for easier mobile pinning.
    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      hasUserInteractedRef.current = true;
      const newLat = event.latLng.lat();
      const newLng = event.latLng.lng();
      pin.setPosition({ lat: newLat, lng: newLng });
      setMarker({ lat: newLat, lng: newLng });
      resolveLabel(newLat, newLng, false);
    });

    const mapDragListener = map.addListener('dragstart', () => {
      hasUserInteractedRef.current = true;
    });

    const mapZoomListener = map.addListener('zoom_changed', () => {
      hasUserInteractedRef.current = true;
    });

    // Move pin to map center after pan/zoom settles (Zomato/Blinkit-style)
    ignoreIdleUntilRef.current = Date.now() + 1000; // ignore initial idle
    const idleListener = map.addListener('idle', () => {
      if (Date.now() < ignoreIdleUntilRef.current) return;
      if (!hasUserInteractedRef.current) return;
      if (idleDebounceRef.current) clearTimeout(idleDebounceRef.current);
      idleDebounceRef.current = setTimeout(() => {
        const center = map.getCenter();
        if (!center) return;
        const newLat = center.lat();
        const newLng = center.lng();
        pin.setPosition({ lat: newLat, lng: newLng });
        setMarker({ lat: newLat, lng: newLng });
        resolveLabel(newLat, newLng, false);
      }, 300);
    });

    // Initial resolve — preserve caller name if already meaningful.
    resolveLabel(latitude, longitude, true);

    return () => {
      dragEndListener.remove();
      clickListener.remove();
      mapDragListener.remove();
      mapZoomListener.remove();
      pin.setMap(null);
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
      geocoderRef.current = null;
      mapInitializedRef.current = false;
    };
  }, [resolveLabel]);

  // If parent updates coordinates, move marker without forcing zoom reset.
  useEffect(() => {
    if (!mapInstanceRef.current || !markerInstanceRef.current || !mapInitializedRef.current) return;

    const nextPos = { lat: latitude, lng: longitude };
    markerInstanceRef.current.setPosition(nextPos);
    setMarker(nextPos);

    // Keep user zoom level; only pan programmatically before user starts interacting.
    if (!hasUserInteractedRef.current) {
      mapInstanceRef.current.panTo(nextPos);
    }

    resolveLabel(latitude, longitude, true);
  }, [latitude, longitude, resolveLabel]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-2.5 bg-primary/5 rounded-xl border border-primary/20">
        <MapPin size={14} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{displayName}</span>
          {formattedAddress && formattedAddress !== displayName && (
            <span className="text-[10px] text-muted-foreground truncate block">{formattedAddress}</span>
          )}
        </div>
        {isGeocoding && <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0 ml-auto" />}
      </div>

      <div ref={mapRef} className="w-full h-72 sm:h-80 rounded-xl border border-border overflow-hidden bg-muted" />

      <p className="text-xs text-muted-foreground text-center">
        Drag or tap the pin to adjust your exact location
      </p>

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
  );
}
