import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTrackingConfig } from '@/hooks/useTrackingConfig';

interface DeliveryMapViewProps {
  riderLat: number;
  riderLng: number;
  destinationLat: number;
  destinationLng: number;
  riderName?: string | null;
  heading?: number | null;
  onRoadEtaChange?: (eta: number | null) => void;
}

function createRiderIcon(heading: number | null): L.DivIcon {
  const rotation = heading != null ? heading : 0;
  return L.divIcon({
    html: `<div style="font-size:28px;text-align:center;transform:rotate(${rotation}deg);transition:transform 0.8s ease">🛵</div>`,
    className: 'leaflet-rider-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

const destinationIcon = L.divIcon({
  html: '<div style="font-size:24px;text-align:center">📍</div>',
  className: 'leaflet-dest-icon',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

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
      if (!map.getBounds().contains([riderLat, riderLng])) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
      }
    }
  }, [map, riderLat, riderLng, destinationLat, destinationLng]);

  return null;
}

function AnimatedRiderMarker({ lat, lng, heading, name, animDuration }: {
  lat: number; lng: number; heading: number | null; name?: string | null; animDuration: number;
}) {
  const markerRef = useRef<L.Marker>(null);
  const prevPos = useRef<[number, number]>([lat, lng]);
  const animFrameRef = useRef<number>(0);
  const lastHeadingRef = useRef<number | null>(heading);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const startLat = prevPos.current[0];
    const startLng = prevPos.current[1];
    const endLat = lat;
    const endLng = lng;

    const dLat = Math.abs(endLat - startLat);
    const dLng = Math.abs(endLng - startLng);
    if (dLat < 0.000001 && dLng < 0.000001) return;

    const startTime = performance.now();

    cancelAnimationFrame(animFrameRef.current);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / animDuration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      const currentLat = startLat + (endLat - startLat) * ease;
      const currentLng = startLng + (endLng - startLng) * ease;

      marker.setLatLng([currentLat, currentLng]);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        prevPos.current = [endLat, endLng];
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [lat, lng, animDuration]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const prev = lastHeadingRef.current;
    const curr = heading;

    if (prev === null && curr === null) return;
    if (prev !== null && curr !== null && Math.abs(curr - prev) < 10) return;

    lastHeadingRef.current = curr;
    marker.setIcon(createRiderIcon(curr));
  }, [heading]);

  return (
    <Marker
      ref={markerRef}
      position={[lat, lng]}
      icon={createRiderIcon(heading)}
    >
      <Popup>{name || 'Delivery Partner'}</Popup>
    </Marker>
  );
}

function useOSRMRoute(
  riderLat: number, riderLng: number,
  destLat: number, destLng: number,
  refetchThreshold: number,
  timeoutMs: number,
) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [roadEtaMinutes, setRoadEtaMinutes] = useState<number | null>(null);
  const [roadDistanceMeters, setRoadDistanceMeters] = useState<number | null>(null);
  const lastFetchPos = useRef<[number, number] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSuccessfulRoute = useRef<[number, number][]>([]);

  // Convert meters threshold to approximate degrees
  const degThreshold = refetchThreshold / 111000;

  const fetchRoute = useCallback(async (retryCount = 0) => {
    if (lastFetchPos.current) {
      const [prevLat, prevLng] = lastFetchPos.current;
      const dLat = Math.abs(riderLat - prevLat);
      const dLng = Math.abs(riderLng - prevLng);
      if (dLat < degThreshold && dLng < degThreshold) return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${riderLng},${riderLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const data = await res.json();
      const route = data.routes?.[0];
      if (route?.geometry?.coordinates) {
        const coords: [number, number][] = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]]
        );
        setRouteCoords(coords);
        lastSuccessfulRoute.current = coords;
        lastFetchPos.current = [riderLat, riderLng];
        if (route.duration != null) {
          setRoadEtaMinutes(Math.max(1, Math.ceil(route.duration / 60)));
        }
        if (route.distance != null) {
          setRoadDistanceMeters(Math.round(route.distance));
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if ((e as Error).name === 'AbortError') {
        if (retryCount < 1) {
          setTimeout(() => fetchRoute(retryCount + 1), 1000);
        } else {
          if (lastSuccessfulRoute.current.length > 0) {
            setRouteCoords(lastSuccessfulRoute.current);
          }
        }
      } else {
        console.warn('[OSRM] Route fetch failed, using cached/straight line');
        if (lastSuccessfulRoute.current.length > 0) {
          setRouteCoords(lastSuccessfulRoute.current);
        }
      }
    }
  }, [riderLat, riderLng, destLat, destLng, degThreshold, timeoutMs]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { routeCoords, roadEtaMinutes, roadDistanceMeters };
}

export function DeliveryMapView({ riderLat, riderLng, destinationLat, destinationLng, riderName, heading, onRoadEtaChange }: DeliveryMapViewProps) {
  const config = useTrackingConfig();
  const center: [number, number] = [
    (riderLat + destinationLat) / 2,
    (riderLng + destinationLng) / 2,
  ];

  const { routeCoords, roadEtaMinutes } = useOSRMRoute(
    riderLat, riderLng, destinationLat, destinationLng,
    config.osrm_refetch_threshold_meters,
    config.osrm_timeout_ms,
  );

  useEffect(() => {
    onRoadEtaChange?.(roadEtaMinutes);
  }, [roadEtaMinutes, onRoadEtaChange]);

  const polylinePositions = routeCoords.length > 0
    ? routeCoords
    : [[riderLat, riderLng] as [number, number], [destinationLat, destinationLng] as [number, number]];

  const polylineStyle = routeCoords.length > 0
    ? { color: 'hsl(var(--primary))', weight: 4, opacity: 0.8 }
    : { color: 'hsl(var(--primary))', weight: 3, dashArray: '8, 8', opacity: 0.7 };

  return (
    <div className="rounded-xl overflow-hidden border border-border h-[200px] relative">
      {roadEtaMinutes && (
        <div className="absolute top-2 right-2 z-[500] bg-background/90 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1 shadow-sm">
          <p className="text-xs font-bold text-primary">{roadEtaMinutes > 3 ? `${roadEtaMinutes - 1}–${roadEtaMinutes + 1}` : roadEtaMinutes} min</p>
          <p className="text-[9px] text-muted-foreground">via road</p>
        </div>
      )}
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
        <AnimatedRiderMarker lat={riderLat} lng={riderLng} heading={heading ?? null} name={riderName} animDuration={config.map_animation_duration_ms} />
        <Marker position={[destinationLat, destinationLng]} icon={destinationIcon}>
          <Popup>Delivery Address</Popup>
        </Marker>
        <Polyline
          positions={polylinePositions}
          pathOptions={polylineStyle}
        />
      </MapContainer>
    </div>
  );
}
