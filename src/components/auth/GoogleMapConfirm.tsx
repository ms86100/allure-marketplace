/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Loader2 } from 'lucide-react';
import {
  extractBestLabel,
  findNearbyPlaceName,
  pickBetterLabel,
  isLowQualityLabel,
  formatCoords,
  LabelQuality,
  type ResolvedLabel,
} from '@/lib/location-label-resolver';

interface GoogleMapConfirmProps {
  latitude: number;
  longitude: number;
  /** Initial name from the caller (e.g. selected autocomplete result). Treated as a high-quality candidate if meaningful. */
  name: string;
  onConfirm: (lat: number, lng: number, updatedName?: string) => void;
  onBack: () => void;
}

/** Check if a caller-provided name is a meaningful initial label (not a generic placeholder). */
function callerNameToLabel(name: string): ResolvedLabel | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const genericPlaceholders = ['store location', 'your location', 'location pinned'];
  if (genericPlaceholders.includes(trimmed.toLowerCase())) return null;
  // Treat caller-provided names as POI quality since they come from autocomplete / user selection
  return { name: trimmed, quality: LabelQuality.POI };
}

export function GoogleMapConfirm({ latitude, longitude, name, onConfirm, onBack }: GoogleMapConfirmProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ lat: number; lng: number }>({ lat: latitude, lng: longitude });
  const [displayName, setDisplayName] = useState(name);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const displayNameRef = useRef(name);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  // Track the quality of the current initial name from the caller
  const initialLabelRef = useRef<ResolvedLabel | null>(callerNameToLabel(name));

  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) {
      console.warn('GoogleMapConfirm: Google Maps not loaded');
      return;
    }

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: latitude, lng: longitude },
      zoom: 16,
      maxZoom: 21,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
      ],
    });

    const pin = new google.maps.Marker({
      position: { lat: latitude, lng: longitude },
      map,
      draggable: true,
      title: 'Adjust your location',
      animation: google.maps.Animation.DROP,
    });

    const geocoder = new google.maps.Geocoder();

    const resolveLabel = async (lat: number, lng: number, preserveInitial: boolean) => {
      setIsGeocoding(true);

      // Start with the initial label if preserving (first load, not dragged)
      let currentBest: ResolvedLabel | null = preserveInitial ? initialLabelRef.current : null;

      try {
        // Step 1: Geocode
        const geocodeResult = await new Promise<google.maps.GeocoderResult[] | null>((resolve) => {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            resolve(status === 'OK' && results ? results : null);
          });
        });

        if (geocodeResult) {
          const geocodeLabel = extractBestLabel(geocodeResult);
          currentBest = pickBetterLabel(currentBest, geocodeLabel);
        }

        // Step 2: If geocode result is low quality, try Places fallback
        if (isLowQualityLabel(currentBest)) {
          console.info('GoogleMapConfirm: Geocode label is low quality, trying Places fallback');
          const placesLabel = await findNearbyPlaceName(map, lat, lng);
          currentBest = pickBetterLabel(currentBest, placesLabel);
        }
      } catch (err) {
        console.warn('GoogleMapConfirm: Label resolution error:', err);
      }

      // Final fallback to coordinates
      if (!currentBest) {
        currentBest = formatCoords(lat, lng);
      }

      setDisplayName(currentBest.name);
      setIsGeocoding(false);
    };

    // Initial resolve — preserve the caller-provided name if it's high quality
    resolveLabel(latitude, longitude, true);

    pin.addListener('dragend', () => {
      const pos = pin.getPosition();
      if (pos) {
        const newLat = pos.lat();
        const newLng = pos.lng();
        setMarker({ lat: newLat, lng: newLng });
        // After drag, don't preserve initial — resolve fresh
        resolveLabel(newLat, newLng, false);
      }
    });

    return () => {
      pin.setMap(null);
    };
  }, [latitude, longitude]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-2.5 bg-primary/5 rounded-xl border border-primary/20">
        <MapPin size={14} className="text-primary shrink-0" />
        <span className="text-sm font-medium truncate">{displayName}</span>
        {isGeocoding && <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0 ml-auto" />}
      </div>

      <div ref={mapRef} className="w-full h-48 rounded-xl border border-border overflow-hidden bg-muted" />

      <p className="text-xs text-muted-foreground text-center">
        Drag the pin to adjust your exact location
      </p>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 rounded-xl">
          Back
        </Button>
        <Button
          onClick={() => onConfirm(marker.lat, marker.lng, displayNameRef.current)}
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
