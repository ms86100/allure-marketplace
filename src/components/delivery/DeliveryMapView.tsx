import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface DeliveryMapViewProps {
  riderLat: number;
  riderLng: number;
  destinationLat: number;
  destinationLng: number;
  riderName?: string | null;
}

// Custom rider icon (scooter emoji as div icon)
const riderIcon = L.divIcon({
  html: '<div style="font-size:24px;text-align:center">🛵</div>',
  className: 'leaflet-rider-icon',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const destinationIcon = L.divIcon({
  html: '<div style="font-size:24px;text-align:center">📍</div>',
  className: 'leaflet-dest-icon',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

/** Auto-fits map bounds when rider position changes */
function MapBoundsUpdater({ riderLat, riderLng, destinationLat, destinationLng }: {
  riderLat: number; riderLng: number; destinationLat: number; destinationLng: number;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  useEffect(() => {
    const bounds = L.latLngBounds(
      [riderLat, riderLng],
      [destinationLat, destinationLng],
    );
    if (!initialFitDone.current) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      initialFitDone.current = true;
    } else {
      // Smoothly pan to keep rider visible
      if (!map.getBounds().contains([riderLat, riderLng])) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
      }
    }
  }, [map, riderLat, riderLng, destinationLat, destinationLng]);

  return null;
}

export function DeliveryMapView({ riderLat, riderLng, destinationLat, destinationLng, riderName }: DeliveryMapViewProps) {
  const center: [number, number] = [
    (riderLat + destinationLat) / 2,
    (riderLng + destinationLng) / 2,
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-border h-[200px] relative">
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        dragging={true}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full z-0"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapBoundsUpdater
          riderLat={riderLat}
          riderLng={riderLng}
          destinationLat={destinationLat}
          destinationLng={destinationLng}
        />
        <Marker position={[riderLat, riderLng]} icon={riderIcon}>
          <Popup>{riderName || 'Delivery Partner'}</Popup>
        </Marker>
        <Marker position={[destinationLat, destinationLng]} icon={destinationIcon}>
          <Popup>Delivery Address</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
