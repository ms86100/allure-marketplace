/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Check } from 'lucide-react';

interface GoogleMapConfirmProps {
  latitude: number;
  longitude: number;
  name: string;
  onConfirm: (lat: number, lng: number) => void;
  onBack: () => void;
}

export function GoogleMapConfirm({ latitude, longitude, name, onConfirm, onBack }: GoogleMapConfirmProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ lat: number; lng: number }>({ lat: latitude, lng: longitude });

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

    pin.addListener('dragend', () => {
      const pos = pin.getPosition();
      if (pos) {
        setMarker({ lat: pos.lat(), lng: pos.lng() });
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
        <span className="text-sm font-medium truncate">{name}</span>
      </div>

      <div ref={mapRef} className="w-full h-48 rounded-xl border border-border overflow-hidden bg-muted" />

      <p className="text-xs text-muted-foreground text-center">
        Drag the pin to adjust your exact location
      </p>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 rounded-xl">
          Back
        </Button>
        <Button onClick={() => onConfirm(marker.lat, marker.lng)} className="flex-1 h-12 rounded-xl font-semibold">
          <Check size={16} className="mr-1" /> Confirm Location
        </Button>
      </div>
    </div>
  );
}
