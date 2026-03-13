/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Loader2 } from 'lucide-react';

const PLUS_CODE_REGEX = /^[23456789CFGHJMPQRVWX]+\+/;

interface GoogleMapConfirmProps {
  latitude: number;
  longitude: number;
  name: string;
  onConfirm: (lat: number, lng: number, updatedName?: string) => void;
  onBack: () => void;
}

/**
 * Given an array of geocoder results, find the best human-readable name,
 * skipping any result whose formatted_address starts with a Plus Code.
 */
function extractBestName(results: google.maps.GeocoderResult[]): string | null {
  for (const result of results) {
    // Skip plus-code results
    if (PLUS_CODE_REGEX.test(result.formatted_address)) continue;
    // Skip results that only have plus_code type
    if (result.types.includes('plus_code' as any)) continue;

    const components = result.address_components || [];
    const get = (type: string) => components.find(c => c.types.includes(type))?.long_name;

    const name = get('premise') || get('point_of_interest') || get('establishment')
      || get('neighborhood') || get('sublocality_level_1') || get('route');
    if (name) return name;

    // If we have a non-plus-code formatted_address, use its first segment
    const firstSegment = result.formatted_address.split(',')[0]?.trim();
    if (firstSegment && !PLUS_CODE_REGEX.test(firstSegment)) return firstSegment;
  }
  return null;
}

export function GoogleMapConfirm({ latitude, longitude, name, onConfirm, onBack }: GoogleMapConfirmProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ lat: number; lng: number }>({ lat: latitude, lng: longitude });
  const [displayName, setDisplayName] = useState(name);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const displayNameRef = useRef(name);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

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

    const reverseGeocodeViaPlaces = (lat: number, lng: number): Promise<string | null> => {
      return new Promise((resolve) => {
        try {
          const service = new google.maps.places.PlacesService(map);
          service.nearbySearch(
            { location: { lat, lng }, radius: 50, rankBy: google.maps.places.RankBy.PROMINENCE },
            (results, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
                resolve(results[0].name || results[0].vicinity || null);
              } else {
                resolve(null);
              }
            }
          );
        } catch {
          resolve(null);
        }
      });
    };

    const reverseGeocode = (lat: number, lng: number) => {
      setIsGeocoding(true);
      geocoder.geocode({ location: { lat, lng } }, async (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          const bestName = extractBestName(results);
          if (bestName) {
            setDisplayName(bestName);
            setIsGeocoding(false);
            return;
          }
          // All results were plus codes — try Places fallback
          console.warn('GoogleMapConfirm: All geocoder results are Plus Codes, trying Places fallback');
        } else {
          console.warn('GoogleMapConfirm: Geocoder failed with status:', status);
        }

        const placeName = await reverseGeocodeViaPlaces(lat, lng);
        if (placeName) {
          setDisplayName(placeName);
        } else {
          setDisplayName(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
        setIsGeocoding(false);
      });
    };

    reverseGeocode(latitude, longitude);

    pin.addListener('dragend', () => {
      const pos = pin.getPosition();
      if (pos) {
        const newLat = pos.lat();
        const newLng = pos.lng();
        setMarker({ lat: newLat, lng: newLng });
        reverseGeocode(newLat, newLng);
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
