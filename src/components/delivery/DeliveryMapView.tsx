import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTrackingConfig } from '@/hooks/useTrackingConfig';
import { MapPin, Navigation } from 'lucide-react';

// ─── Props ───────────────────────────────────────────────────────────────────

interface DeliveryMapViewProps {
  riderLat: number;
  riderLng: number;
  destinationLat: number;
  destinationLng: number;
  riderName?: string | null;
  heading?: number | null;
  onRoadEtaChange?: (eta: number | null) => void;
}

// ─── Icon cache (Bug 6 fix: memoize by rounded heading) ─────────────────────

const iconCache = new Map<string, L.DivIcon>();

function getRiderIcon(heading: number | null): L.DivIcon {
  const rounded = heading != null ? Math.round(heading / 15) * 15 : 0;
  const key = `rider-${rounded}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const icon = L.divIcon({
    html: `
      <div class="rider-icon-wrapper" style="transform:rotate(${rounded}deg);transition:transform 0.8s cubic-bezier(0.4,0,0.2,1)">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Shadow ellipse -->
          <ellipse cx="24" cy="44" rx="10" ry="3" fill="rgba(0,0,0,0.15)"/>
          <!-- Scooty body -->
          <path d="M16 32 C16 28 18 26 22 25 L26 25 C30 26 32 28 32 32 L30 34 L18 34 Z" fill="hsl(var(--primary))"/>
          <!-- Wheels -->
          <circle cx="18" cy="36" r="4" fill="#333" stroke="#666" stroke-width="1"/>
          <circle cx="30" cy="36" r="4" fill="#333" stroke="#666" stroke-width="1"/>
          <circle cx="18" cy="36" r="1.5" fill="#999"/>
          <circle cx="30" cy="36" r="1.5" fill="#999"/>
          <!-- Handlebar -->
          <path d="M20 25 L18 20 L16 18" stroke="#555" stroke-width="1.5" stroke-linecap="round" fill="none"/>
          <!-- Rider silhouette -->
          <circle cx="24" cy="14" r="4" fill="#444"/>
          <path d="M20 18 C20 18 22 22 24 22 C26 22 28 18 28 18" fill="#555"/>
          <path d="M22 22 L22 26 M26 22 L26 26" stroke="#555" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Delivery bag with Sociva branding -->
          <rect x="26" y="16" width="12" height="10" rx="2" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" stroke-width="0.5"/>
          <text x="32" y="23" text-anchor="middle" fill="hsl(var(--primary-foreground))" font-size="4" font-weight="bold" font-family="system-ui">Sociva</text>
          <!-- Bag handle -->
          <path d="M29 16 L29 14 C29 13 31 12 32 12 C33 12 35 13 35 14 L35 16" stroke="hsl(var(--primary-foreground))" stroke-width="0.8" fill="none"/>
        </svg>
      </div>
    `,
    className: 'leaflet-rider-icon',
    iconSize: [48, 48],
    iconAnchor: [24, 40],
  });

  iconCache.set(key, icon);
  return icon;
}

const destinationIcon = L.divIcon({
  html: `
    <div class="destination-pin-wrapper">
      <div class="destination-pulse-ring"></div>
      <div class="destination-pulse-ring destination-pulse-ring-2"></div>
      <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z" fill="hsl(var(--destructive))"/>
        <circle cx="18" cy="18" r="8" fill="white"/>
        <circle cx="18" cy="18" r="4" fill="hsl(var(--destructive))"/>
      </svg>
    </div>
  `,
  className: 'leaflet-dest-icon',
  iconSize: [36, 44],
  iconAnchor: [18, 44],
});

// ─── Map camera with smooth flyTo (Bug 18 fix: no misleading center) ─────────

function MapCameraController({ riderLat, riderLng, destinationLat, destinationLng }: {
  riderLat: number; riderLng: number; destinationLat: number; destinationLng: number;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);
  const userPanned = useRef(false);

  useEffect(() => {
    const onDrag = () => { userPanned.current = true; };
    map.on('dragstart', onDrag);
    return () => { map.off('dragstart', onDrag); };
  }, [map]);

  useEffect(() => {
    const bounds = L.latLngBounds(
      [riderLat, riderLng],
      [destinationLat, destinationLng],
    );
    if (!initialFitDone.current) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      initialFitDone.current = true;
    } else if (!userPanned.current) {
      // Smooth fly to keep rider visible
      if (!map.getBounds().pad(-0.2).contains([riderLat, riderLng])) {
        map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 16, duration: 1.2 });
      }
    }
  }, [map, riderLat, riderLng, destinationLat, destinationLng]);

  return null;
}

// ─── Re-center button ────────────────────────────────────────────────────────

function RecenterButton({ riderLat, riderLng, destinationLat, destinationLng }: {
  riderLat: number; riderLng: number; destinationLat: number; destinationLng: number;
}) {
  const map = useMap();
  const [showRecenter, setShowRecenter] = useState(false);

  useEffect(() => {
    const onDragEnd = () => {
      const bounds = L.latLngBounds([riderLat, riderLng], [destinationLat, destinationLng]);
      setShowRecenter(!map.getBounds().intersects(bounds));
    };
    const onFlyEnd = () => setShowRecenter(false);
    map.on('dragend', onDragEnd);
    map.on('moveend', () => {
      if (!map.getBounds().contains([riderLat, riderLng])) {
        setShowRecenter(true);
      }
    });
    return () => {
      map.off('dragend', onDragEnd);
      map.off('moveend', onFlyEnd);
    };
  }, [map, riderLat, riderLng, destinationLat, destinationLng]);

  if (!showRecenter) return null;

  return (
    <button
      onClick={() => {
        const bounds = L.latLngBounds([riderLat, riderLng], [destinationLat, destinationLng]);
        map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 16, duration: 0.8 });
        setShowRecenter(false);
      }}
      className="absolute bottom-3 right-3 z-[500] bg-background/95 backdrop-blur-sm border border-border rounded-full p-2.5 shadow-lg hover:bg-accent transition-colors"
      aria-label="Re-center map"
    >
      <Navigation className="h-4 w-4 text-primary" />
    </button>
  );
}

// ─── Animated rider marker (Bug 5 fix: update prevPos at start) ──────────────

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

    // Bug 5 fix: Capture current marker position as animation start
    const currentLatLng = marker.getLatLng();
    const startLat = currentLatLng.lat;
    const startLng = currentLatLng.lng;
    const endLat = lat;
    const endLng = lng;

    const dLat = Math.abs(endLat - startLat);
    const dLng = Math.abs(endLng - startLng);
    if (dLat < 0.000001 && dLng < 0.000001) return;

    // Update prevPos immediately
    prevPos.current = [endLat, endLng];

    const startTime = performance.now();
    cancelAnimationFrame(animFrameRef.current);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / animDuration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out

      const currentLat = startLat + (endLat - startLat) * ease;
      const currentLng = startLng + (endLng - startLng) * ease;
      marker.setLatLng([currentLat, currentLng]);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [lat, lng, animDuration]);

  // Bug 6 fix: only update icon when heading changes significantly
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const prev = lastHeadingRef.current;
    const curr = heading;
    if (prev === null && curr === null) return;
    if (prev !== null && curr !== null && Math.abs(curr - prev) < 10) return;

    lastHeadingRef.current = curr;
    marker.setIcon(getRiderIcon(curr));
  }, [heading]);

  return (
    <Marker
      ref={markerRef}
      position={[lat, lng]}
      icon={getRiderIcon(heading)}
    >
      <Popup>{name || 'Delivery Partner'}</Popup>
    </Marker>
  );
}

// ─── OSRM route hook (Bugs 2, 8, 20 fixes) ──────────────────────────────────

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

  const fetchRoute = useCallback(async (retryCount = 0) => {
    if (lastFetchPos.current) {
      const [prevLat, prevLng] = lastFetchPos.current;
      // Bug 8 fix: latitude-corrected threshold for longitude
      const degThresholdLat = refetchThreshold / 111000;
      const degThresholdLng = refetchThreshold / (111000 * Math.cos(riderLat * Math.PI / 180));
      const dLat = Math.abs(riderLat - prevLat);
      const dLng = Math.abs(riderLng - prevLng);
      if (dLat < degThresholdLat && dLng < degThresholdLng) return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${riderLng},${riderLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId); // Bug 20: clear immediately after fetch

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
      clearTimeout(timeoutId); // Bug 20: also clear in catch
      if ((e as Error).name === 'AbortError') {
        // Bug 2 fix: retry with jittered backoff, up to 2 retries
        if (retryCount < 2) {
          const jitter = Math.random() * 500;
          setTimeout(() => fetchRoute(retryCount + 1), 1000 * (retryCount + 1) + jitter);
        } else if (lastSuccessfulRoute.current.length > 0) {
          setRouteCoords(lastSuccessfulRoute.current);
        }
      } else {
        console.warn('[OSRM] Route fetch failed, using cached/straight line');
        if (lastSuccessfulRoute.current.length > 0) {
          setRouteCoords(lastSuccessfulRoute.current);
        }
      }
    }
  }, [riderLat, riderLng, destLat, destLng, refetchThreshold, timeoutMs]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);
  useEffect(() => { return () => abortRef.current?.abort(); }, []);

  return { routeCoords, roadEtaMinutes, roadDistanceMeters };
}

// ─── Split route into completed/remaining segments ───────────────────────────

function useRouteSplit(routeCoords: [number, number][], riderLat: number, riderLng: number) {
  return useMemo(() => {
    if (routeCoords.length < 2) return { completed: [] as [number, number][], remaining: [] as [number, number][] };

    // Find closest point on route to rider
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < routeCoords.length; i++) {
      const [lat, lng] = routeCoords[i];
      const d = Math.pow(lat - riderLat, 2) + Math.pow(lng - riderLng, 2);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }

    return {
      completed: routeCoords.slice(0, closestIdx + 1),
      remaining: [[riderLat, riderLng] as [number, number], ...routeCoords.slice(closestIdx)],
    };
  }, [routeCoords, riderLat, riderLng]);
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DeliveryMapView({
  riderLat, riderLng, destinationLat, destinationLng,
  riderName, heading, onRoadEtaChange,
}: DeliveryMapViewProps) {
  const config = useTrackingConfig();

  // Bug 18 fix: static initial center, only used on mount
  const initialCenter = useRef<[number, number]>([
    (riderLat + destinationLat) / 2,
    (riderLng + destinationLng) / 2,
  ]);

  const { routeCoords, roadEtaMinutes, roadDistanceMeters } = useOSRMRoute(
    riderLat, riderLng, destinationLat, destinationLng,
    config.osrm_refetch_threshold_meters,
    config.osrm_timeout_ms,
  );

  // Bug 11 fix: guard onRoadEtaChange with ref to prevent loops
  const prevEtaRef = useRef<number | null>(null);
  useEffect(() => {
    if (roadEtaMinutes !== prevEtaRef.current) {
      prevEtaRef.current = roadEtaMinutes;
      onRoadEtaChange?.(roadEtaMinutes);
    }
  }, [roadEtaMinutes, onRoadEtaChange]);

  const { completed, remaining } = useRouteSplit(routeCoords, riderLat, riderLng);

  const polylinePositions = routeCoords.length > 0
    ? routeCoords
    : [[riderLat, riderLng] as [number, number], [destinationLat, destinationLng] as [number, number]];

  const hasRoute = routeCoords.length > 0;

  // Distance in km for display
  const distanceKm = roadDistanceMeters != null ? (roadDistanceMeters / 1000).toFixed(1) : null;

  return (
    <div className="rounded-xl overflow-hidden border border-border h-[260px] relative shadow-sm">
      {/* ETA Overlay */}
      {roadEtaMinutes && (
        <div className="absolute top-2.5 right-2.5 z-[500] bg-background/90 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-md">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">
                {roadEtaMinutes > 3 ? `${roadEtaMinutes - 1}–${roadEtaMinutes + 1}` : roadEtaMinutes} min
              </p>
              {distanceKm && (
                <p className="text-[10px] text-muted-foreground leading-tight">{distanceKm} km via road</p>
              )}
            </div>
          </div>
          {/* Mini progress bar */}
          {roadDistanceMeters != null && (
            <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                style={{ width: `${Math.max(5, Math.min(95, 100 - (roadDistanceMeters / 50)))}%` }}
              />
            </div>
          )}
        </div>
      )}

      <MapContainer
        center={initialCenter.current}
        zoom={14}
        scrollWheelZoom={false}
        dragging={true}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full z-0"
      >
        {/* CartoDB Voyager tiles for cleaner modern look */}
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

        <MapCameraController
          riderLat={riderLat}
          riderLng={riderLng}
          destinationLat={destinationLat}
          destinationLng={destinationLng}
        />

        <RecenterButton
          riderLat={riderLat}
          riderLng={riderLng}
          destinationLat={destinationLat}
          destinationLng={destinationLng}
        />

        <AnimatedRiderMarker
          lat={riderLat} lng={riderLng}
          heading={heading ?? null}
          name={riderName}
          animDuration={config.map_animation_duration_ms}
        />

        <Marker position={[destinationLat, destinationLng]} icon={destinationIcon}>
          <Popup>Delivery Address</Popup>
        </Marker>

        {/* Completed route (muted) */}
        {hasRoute && completed.length > 1 && (
          <Polyline
            positions={completed}
            pathOptions={{ color: 'hsl(var(--muted-foreground))', weight: 3, opacity: 0.4 }}
          />
        )}

        {/* Remaining route (vibrant with animation class) */}
        {hasRoute ? (
          <Polyline
            positions={remaining.length > 1 ? remaining : polylinePositions}
            pathOptions={{ color: 'hsl(var(--primary))', weight: 4, opacity: 0.85 }}
            className="animated-route-line"
          />
        ) : (
          <Polyline
            positions={polylinePositions}
            pathOptions={{ color: 'hsl(var(--primary))', weight: 3, dashArray: '8, 8', opacity: 0.6 }}
          />
        )}
      </MapContainer>

      {/* CSS for pulsing destination and animated route */}
      <style>{`
        .leaflet-rider-icon {
          background: none !important;
          border: none !important;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        .leaflet-dest-icon {
          background: none !important;
          border: none !important;
        }
        .destination-pin-wrapper {
          position: relative;
          width: 36px;
          height: 44px;
        }
        .destination-pulse-ring {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: hsl(var(--destructive) / 0.2);
          animation: dest-pulse 2s ease-out infinite;
        }
        .destination-pulse-ring-2 {
          animation-delay: 0.8s;
        }
        @keyframes dest-pulse {
          0% { transform: translateX(-50%) scale(0.8); opacity: 1; }
          100% { transform: translateX(-50%) scale(2.5); opacity: 0; }
        }
        .animated-route-line {
          stroke-dasharray: 12 6;
          animation: route-dash 1.5s linear infinite;
        }
        @keyframes route-dash {
          to { stroke-dashoffset: -18; }
        }
      `}</style>
    </div>
  );
}
