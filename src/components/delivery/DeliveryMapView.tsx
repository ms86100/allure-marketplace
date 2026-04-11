// @ts-nocheck
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
  /** Seller/restaurant origin for 3-point display */
  sellerLat?: number | null;
  sellerLng?: number | null;
  sellerName?: string | null;
  /** Whether order has been picked up (affects camera behavior) */
  isPickedUp?: boolean;
  /** Taller map for transit view */
  tall?: boolean;
  /** Callback with route distances for progress calculation */
  onRouteInfo?: (info: { totalDistance: number; remainingDistance: number }) => void;
}

// ─── Haversine distance ──────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Icon cache (memoize by rounded heading) ────────────────────────────────

const iconCache = new Map<string, L.DivIcon>();

function getRiderIcon(heading: number | null): L.DivIcon {
  const rounded = heading != null ? Math.round(heading / 15) * 15 : 0;
  const key = `rider-${rounded}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const icon = L.divIcon({
    html: `
      <div class="rider-icon-wrapper tracking-rider-pulse" style="transform:rotate(${rounded}deg);transition:transform 0.8s cubic-bezier(0.4,0,0.2,1)">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="28,2 22,14 28,10 34,14" fill="hsl(var(--primary))" opacity="0.7"/>
          <ellipse cx="28" cy="50" rx="12" ry="3.5" fill="rgba(0,0,0,0.18)"/>
          <path d="M18 38 C18 33 21 30 26 29 L30 29 C35 30 38 33 38 38 L36 40 L20 40 Z" fill="#3a3a3a" stroke="#555" stroke-width="1"/>
          <circle cx="20" cy="42" r="4.5" fill="#2a2a2a" stroke="#666" stroke-width="1.5"/>
          <circle cx="36" cy="42" r="4.5" fill="#2a2a2a" stroke="#666" stroke-width="1.5"/>
          <circle cx="20" cy="42" r="1.5" fill="#aaa"/>
          <circle cx="36" cy="42" r="1.5" fill="#aaa"/>
          <path d="M23 29 L21 24 L18 21" stroke="#666" stroke-width="2" stroke-linecap="round" fill="none"/>
          <circle cx="28" cy="17" r="5" fill="#444" stroke="#555" stroke-width="1"/>
          <path d="M23 22 C23 22 25 27 28 27 C31 27 33 22 33 22" fill="#555"/>
          <path d="M25 27 L25 31 M31 27 L31 31" stroke="#555" stroke-width="2" stroke-linecap="round"/>
          <rect x="32" y="18" width="14" height="12" rx="2.5" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" stroke-width="1"/>
          <text x="39" y="27.5" text-anchor="middle" fill="hsl(var(--primary-foreground))" font-size="10" font-weight="900" font-family="system-ui">S</text>
          <path d="M35.5 18 L35.5 15.5 C35.5 14 37 13 39 13 C41 13 42.5 14 42.5 15.5 L42.5 18" stroke="hsl(var(--primary-foreground))" stroke-width="1.2" fill="none"/>
        </svg>
      </div>
    `,
    className: 'leaflet-rider-icon',
    iconSize: [56, 56],
    iconAnchor: [28, 46],
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

const sellerIcon = L.divIcon({
  html: `
    <div class="seller-pin-wrapper">
      <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="hsl(var(--primary))"/>
        <circle cx="16" cy="16" r="7" fill="white"/>
        <text x="16" y="20" text-anchor="middle" fill="hsl(var(--primary))" font-size="12" font-weight="700" font-family="system-ui">🏪</text>
      </svg>
    </div>
  `,
  className: 'leaflet-seller-icon',
  iconSize: [32, 40],
  iconAnchor: [16, 40],
});

// ─── Dynamic zoom camera controller ─────────────────────────────────────────

function MapCameraController({ riderLat, riderLng, destinationLat, destinationLng, sellerLat, sellerLng, isPickedUp }: {
  riderLat: number; riderLng: number; destinationLat: number; destinationLng: number;
  sellerLat?: number | null; sellerLng?: number | null; isPickedUp?: boolean;
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
    // Dynamic zoom based on distance
    const distToDestination = haversineMeters(riderLat, riderLng, destinationLat, destinationLng);
    
    let targetZoom = 14;
    if (distToDestination > 5000) targetZoom = 12;
    else if (distToDestination > 2000) targetZoom = 14;
    else if (distToDestination > 500) targetZoom = 15;
    else targetZoom = 16;

    if (!initialFitDone.current) {
      // Initial: fit all markers
      const points: [number, number][] = [[riderLat, riderLng], [destinationLat, destinationLng]];
      if (sellerLat && sellerLng) points.push([sellerLat, sellerLng]);
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: targetZoom });
      initialFitDone.current = true;
    } else if (!userPanned.current) {
      if (isPickedUp) {
        // After pickup: follow rider, dynamic zoom toward destination
        if (!map.getBounds().pad(-0.2).contains([riderLat, riderLng])) {
          map.flyTo([riderLat, riderLng], targetZoom, { duration: 1.2 });
        }
      } else {
        // Before pickup: show restaurant and rider
        const bounds = L.latLngBounds(
          [riderLat, riderLng],
          sellerLat && sellerLng ? [sellerLat, sellerLng] : [destinationLat, destinationLng],
        );
        if (!map.getBounds().pad(-0.2).contains([riderLat, riderLng])) {
          map.flyToBounds(bounds, { padding: [50, 50], maxZoom: targetZoom, duration: 1.2 });
        }
      }
    }
  }, [map, riderLat, riderLng, destinationLat, destinationLng, sellerLat, sellerLng, isPickedUp]);

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

// ─── GPS Smoothing + Animated rider marker ───────────────────────────────────

function AnimatedRiderMarker({ lat, lng, heading, name, animDuration, etaMinutes, distanceMeters }: {
  lat: number; lng: number; heading: number | null; name?: string | null; animDuration: number;
  etaMinutes?: number | null; distanceMeters?: number | null;
}) {
  const markerRef = useRef<L.Marker>(null);
  const animFrameRef = useRef<number>(0);
  const lastHeadingRef = useRef<number | null>(heading);
  // GPS smoothing: keep last 3 positions with timestamps
  const posHistory = useRef<{ lat: number; lng: number; time: number }[]>([]);

  // GPS smoothing: validate and smooth position
  const smoothedPos = useMemo(() => {
    const now = Date.now();
    const history = posHistory.current;

    // Check for unrealistic jump (>200m in <2s)
    if (history.length > 0) {
      const last = history[history.length - 1];
      const dist = haversineMeters(last.lat, last.lng, lat, lng);
      const timeDiff = (now - last.time) / 1000;
      if (dist > 200 && timeDiff < 2) {
        // Ignore this point — return last known good position
        return { lat: last.lat, lng: last.lng };
      }
    }

    // Add to history, keep last 3
    history.push({ lat, lng, time: now });
    if (history.length > 3) history.shift();

    // Weighted average of last 3 points (most recent = highest weight)
    if (history.length >= 3) {
      const weights = [0.15, 0.3, 0.55];
      let sLat = 0, sLng = 0;
      for (let i = 0; i < 3; i++) {
        sLat += history[i].lat * weights[i];
        sLng += history[i].lng * weights[i];
      }
      return { lat: sLat, lng: sLng };
    }

    return { lat, lng };
  }, [lat, lng]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const currentLatLng = marker.getLatLng();
    const startLat = currentLatLng.lat;
    const startLng = currentLatLng.lng;
    const endLat = smoothedPos.lat;
    const endLng = smoothedPos.lng;

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
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [smoothedPos.lat, smoothedPos.lng, animDuration]);

  // Only update icon when heading changes significantly
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

  // Build popup content with mini card
  const distText = distanceMeters
    ? distanceMeters < 1000
      ? `${distanceMeters}m away`
      : `${(distanceMeters / 1000).toFixed(1)} km away`
    : null;

  return (
    <Marker
      ref={markerRef}
      position={[smoothedPos.lat, smoothedPos.lng]}
      icon={getRiderIcon(heading)}
    >
      <Popup>
        <div className="text-center min-w-[120px]">
          <p className="font-bold text-sm">{name || 'Delivery Partner'}</p>
          {etaMinutes && <p className="text-xs text-muted-foreground mt-0.5">ETA: {etaMinutes} min</p>}
          {distText && <p className="text-xs text-muted-foreground">{distText}</p>}
        </div>
      </Popup>
    </Marker>
  );
}

// ─── OSRM route hook ─────────────────────────────────────────────────────────

function useOSRMRoute(
  riderLat: number, riderLng: number,
  destLat: number, destLng: number,
  refetchThreshold: number,
  timeoutMs: number,
) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [roadEtaMinutes, setRoadEtaMinutes] = useState<number | null>(null);
  const [roadDistanceMeters, setRoadDistanceMeters] = useState<number | null>(null);
  const [totalRouteDistance, setTotalRouteDistance] = useState<number | null>(null);
  const lastFetchPos = useRef<[number, number] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSuccessfulRoute = useRef<[number, number][]>([]);

  const fetchRoute = useCallback(async (retryCount = 0) => {
    if (lastFetchPos.current) {
      const [prevLat, prevLng] = lastFetchPos.current;
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
        
        // Store total route distance on first fetch
        if (route.distance != null) {
          setRoadDistanceMeters(Math.round(route.distance));
          if (totalRouteDistance === null) {
            setTotalRouteDistance(Math.round(route.distance));
          }
        }

        if (route.duration != null) {
          // Primary ETA: OSRM route duration
          let etaMin = Math.max(1, Math.ceil(route.duration / 60));
          
          // Add time-of-day buffer (rush hour adjustment)
          const hour = new Date().getHours();
          const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
          const buffer = 2 + (isRushHour ? 3 : 0);
          etaMin += buffer;
          
          setRoadEtaMinutes(etaMin);
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if ((e as Error).name === 'AbortError') {
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
        
        // Fallback ETA: distance-based
        const straightLineDist = haversineMeters(riderLat, riderLng, destLat, destLng);
        const fallbackEta = Math.max(1, Math.ceil(straightLineDist / 1000 * 4)); // ~15km/h avg
        setRoadEtaMinutes(fallbackEta);
      }
    }
  }, [riderLat, riderLng, destLat, destLng, refetchThreshold, timeoutMs]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);
  useEffect(() => { return () => abortRef.current?.abort(); }, []);

  return { routeCoords, roadEtaMinutes, roadDistanceMeters, totalRouteDistance };
}

// ─── Split route into completed/remaining segments ───────────────────────────

function useRouteSplit(routeCoords: [number, number][], riderLat: number, riderLng: number) {
  return useMemo(() => {
    if (routeCoords.length < 2) return { completed: [] as [number, number][], remaining: [] as [number, number][], remainingDistance: 0 };

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

    const remaining = [[riderLat, riderLng] as [number, number], ...routeCoords.slice(closestIdx)];
    
    // Calculate remaining distance
    let remainingDistance = 0;
    for (let i = 0; i < remaining.length - 1; i++) {
      remainingDistance += haversineMeters(remaining[i][0], remaining[i][1], remaining[i + 1][0], remaining[i + 1][1]);
    }

    return {
      completed: routeCoords.slice(0, closestIdx + 1),
      remaining,
      remainingDistance: Math.round(remainingDistance),
    };
  }, [routeCoords, riderLat, riderLng]);
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DeliveryMapView({
  riderLat, riderLng, destinationLat, destinationLng,
  riderName, heading, onRoadEtaChange,
  sellerLat, sellerLng, sellerName,
  isPickedUp, tall, onRouteInfo,
}: DeliveryMapViewProps) {
  const config = useTrackingConfig();

  const initialCenter = useRef<[number, number]>([
    (riderLat + destinationLat) / 2,
    (riderLng + destinationLng) / 2,
  ]);

  const { routeCoords, roadEtaMinutes, roadDistanceMeters, totalRouteDistance } = useOSRMRoute(
    riderLat, riderLng, destinationLat, destinationLng,
    config.osrm_refetch_threshold_meters,
    config.osrm_timeout_ms,
  );

  // Notify parent of ETA changes
  const prevEtaRef = useRef<number | null>(null);
  useEffect(() => {
    if (roadEtaMinutes !== prevEtaRef.current) {
      prevEtaRef.current = roadEtaMinutes;
      onRoadEtaChange?.(roadEtaMinutes);
    }
  }, [roadEtaMinutes, onRoadEtaChange]);

  const { completed, remaining, remainingDistance } = useRouteSplit(routeCoords, riderLat, riderLng);

  // Notify parent of route info for progress calculation
  useEffect(() => {
    if (totalRouteDistance && remainingDistance != null) {
      onRouteInfo?.({ totalDistance: totalRouteDistance, remainingDistance });
    }
  }, [totalRouteDistance, remainingDistance, onRouteInfo]);

  const polylinePositions = routeCoords.length > 0
    ? routeCoords
    : [[riderLat, riderLng] as [number, number], [destinationLat, destinationLng] as [number, number]];

  const hasRoute = routeCoords.length > 0;

  const distanceKm = roadDistanceMeters != null ? (roadDistanceMeters / 1000).toFixed(1) : null;

  const mapHeight = tall ? 'h-[320px]' : 'h-[260px]';

  return (
    <div className={`rounded-xl overflow-hidden border border-border ${mapHeight} relative shadow-sm transition-all duration-500`}>
      {/* ETA Overlay */}
      {roadEtaMinutes && (
        <div className="absolute bottom-2.5 right-2.5 z-[500] bg-background/90 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-md">
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
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

        <MapCameraController
          riderLat={riderLat}
          riderLng={riderLng}
          destinationLat={destinationLat}
          destinationLng={destinationLng}
          sellerLat={sellerLat}
          sellerLng={sellerLng}
          isPickedUp={isPickedUp}
        />

        <RecenterButton
          riderLat={riderLat}
          riderLng={riderLng}
          destinationLat={destinationLat}
          destinationLng={destinationLng}
        />

        {/* Seller/Restaurant marker */}
        {sellerLat && sellerLng && (
          <Marker position={[sellerLat, sellerLng]} icon={sellerIcon}>
            <Popup>{sellerName || 'Restaurant'}</Popup>
          </Marker>
        )}

        <AnimatedRiderMarker
          lat={riderLat} lng={riderLng}
          heading={heading ?? null}
          name={riderName}
          animDuration={config.map_animation_duration_ms}
          etaMinutes={roadEtaMinutes}
          distanceMeters={roadDistanceMeters}
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

        {/* Remaining route (vibrant) */}
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
        .leaflet-rider-icon,
        .leaflet-seller-icon {
          background: none !important;
          border: none !important;
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
