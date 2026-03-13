/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Loader2 } from 'lucide-react';

interface GoogleMapConfirmProps {
  latitude: number;
  longitude: number;
  name: string;
  onConfirm: (lat: number, lng: number, updatedName?: string) => void;
  onBack: () => void;
}

export function GoogleMapConfirm({ latitude, longitude, name, onConfirm, onBack }: GoogleMapConfirmProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ lat: number; lng: number }>({ lat: latitude, lng: longitude });
  const [displayName, setDisplayName] = useState(name);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Keep a ref for the latest geocoded name so the confirm button always uses it
  const displayNameRef = useRef(name);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: latitude, lng: longitude },
      zoom: 16,
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

    // Also reverse-geocode the initial position so the displayed address is always accurate
    const reverseGeocode = (lat: number, lng: number) => {
      setIsGeocoding(true);
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        setIsGeocoding(false);
        if (status === 'OK' && results && results[0]) {
          const result = results[0];
          const premise = result.address_components?.find(c => c.types.includes('premise'))?.long_name;
          const sublocality = result.address_components?.find(c => c.types.includes('sublocality_level_1'))?.long_name;
          const neighborhood = result.address_components?.find(c => c.types.includes('neighborhood'))?.long_name;
          const route = result.address_components?.find(c => c.types.includes('route'))?.long_name;
          const updatedName = premise || neighborhood || sublocality || route || result.formatted_address.split(',')[0];
          setDisplayName(updatedName);
        }
      });
    };

    // Reverse geocode initial position for accuracy
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
        <Button onClick={() => onConfirm(marker.lat, marker.lng, displayNameRef.current)} className="flex-1 h-12 rounded-xl font-semibold">
          <Check size={16} className="mr-1" /> Confirm Location
        </Button>
      </div>
    </div>
  );
}
