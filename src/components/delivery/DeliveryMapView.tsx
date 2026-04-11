// @ts-nocheck
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { useTrackingConfig } from '@/hooks/useTrackingConfig';
import { Navigation, MapPin, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Props ───────────────────────────────────────────────────────────────────

interface DeliveryMapViewProps {
  riderLat: number;
  riderLng: number;
  destinationLat: number;
  destinationLng: number;
  riderName?: string | null;
  heading?: number | null;
  onRoadEtaChange?: (eta: number | null) => void;
  sellerLat?: number | null;
  sellerLng?: number | null;
  sellerName?: string | null;
  isPickedUp?: boolean;
  tall?: boolean;
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

// ─── GPS Smoothing ───────────────────────────────────────────────────────────

function useGPSSmoothing(lat: number, lng: number) {
  const history = useRef<{ lat: number; lng: number; time: number }[]>([]);

  return useMemo(() => {
    const now = Date.now();
    const h = history.current;

    if (h.length > 0) {
      const last = h[h.length - 1];
      const dist = haversineMeters(last.lat, last.lng, lat, lng);
      const timeDiff = (now - last.time) / 1000;
      if (dist > 200 && timeDiff < 2) {
        return { lat: last.lat, lng: last.lng };
      }
    }

    h.push({ lat, lng, time: now });
    if (h.length > 3) h.shift();

    if (h.length >= 3) {
      const weights = [0.15, 0.3, 0.55];
      let sLat = 0, sLng = 0;
      for (let i = 0; i < 3; i++) {
        sLat += h[i].lat * weights[i];
        sLng += h[i].lng * weights[i];
      }
      return { lat: sLat, lng: sLng };
    }
    return { lat, lng };
  }, [lat, lng]);
}

// ─── OSRM route hook ─────────────────────────────────────────────────────────

function useOSRMRoute(
  riderLat: number, riderLng: number,
  destLat: number, destLng: number,
  refetchThreshold: number,
  timeoutMs: number,
) {
  const [routeCoords, setRouteCoords] = useState<{ lat: number; lng: number }[]>([]);
  const [roadEtaMinutes, setRoadEtaMinutes] = useState<number | null>(null);
  const [roadDistanceMeters, setRoadDistanceMeters] = useState<number | null>(null);
  const [totalRouteDistance, setTotalRouteDistance] = useState<number | null>(null);
  const lastFetchPos = useRef<[number, number] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSuccessfulRoute = useRef<{ lat: number; lng: number }[]>([]);

  const fetchRoute = useCallback(async (retryCount = 0) => {
    if (lastFetchPos.current) {
      const [prevLat, prevLng] = lastFetchPos.current;
      const degThresholdLat = refetchThreshold / 111000;
      const degThresholdLng = refetchThreshold / (111000 * Math.cos(riderLat * Math.PI / 180));
      if (Math.abs(riderLat - prevLat) < degThresholdLat && Math.abs(riderLng - prevLng) < degThresholdLng) return;
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
        const coords = route.geometry.coordinates.map((c: [number, number]) => ({ lat: c[1], lng: c[0] }));
        setRouteCoords(coords);
        lastSuccessfulRoute.current = coords;
        lastFetchPos.current = [riderLat, riderLng];

        if (route.distance != null) {
          setRoadDistanceMeters(Math.round(route.distance));
          if (totalRouteDistance === null) setTotalRouteDistance(Math.round(route.distance));
        }
        if (route.duration != null) {
          let etaMin = Math.max(1, Math.ceil(route.duration / 60));
          const hour = new Date().getHours();
          const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
          etaMin += 2 + (isRushHour ? 3 : 0);
          setRoadEtaMinutes(etaMin);
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if ((e as Error).name === 'AbortError' && retryCount < 2) {
        setTimeout(() => fetchRoute(retryCount + 1), 1000 * (retryCount + 1) + Math.random() * 500);
      } else {
        if (lastSuccessfulRoute.current.length > 0) setRouteCoords(lastSuccessfulRoute.current);
        const fallbackDist = haversineMeters(riderLat, riderLng, destLat, destLng);
        setRoadEtaMinutes(Math.max(1, Math.ceil(fallbackDist / 1000 * 4)));
      }
    }
  }, [riderLat, riderLng, destLat, destLng, refetchThreshold, timeoutMs]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);
  useEffect(() => { return () => abortRef.current?.abort(); }, []);

  return { routeCoords, roadEtaMinutes, roadDistanceMeters, totalRouteDistance };
}

// ─── Route split (completed/remaining) ───────────────────────────────────────

function useRouteSplit(routeCoords: { lat: number; lng: number }[], riderLat: number, riderLng: number) {
  return useMemo(() => {
    if (routeCoords.length < 2) return { completed: [] as { lat: number; lng: number }[], remaining: [] as { lat: number; lng: number }[], remainingDistance: 0 };

    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < routeCoords.length; i++) {
      const d = Math.pow(routeCoords[i].lat - riderLat, 2) + Math.pow(routeCoords[i].lng - riderLng, 2);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }

    const remaining = [{ lat: riderLat, lng: riderLng }, ...routeCoords.slice(closestIdx)];
    let remainingDistance = 0;
    for (let i = 0; i < remaining.length - 1; i++) {
      remainingDistance += haversineMeters(remaining[i].lat, remaining[i].lng, remaining[i + 1].lat, remaining[i + 1].lng);
    }

    return {
      completed: routeCoords.slice(0, closestIdx + 1),
      remaining,
      remainingDistance: Math.round(remainingDistance),
    };
  }, [routeCoords, riderLat, riderLng]);
}

// ─── Map Fallback Card ───────────────────────────────────────────────────────

function MapFallbackCard({
  riderLat, riderLng, destinationLat, destinationLng,
  riderName, roadEtaMinutes, roadDistanceMeters, tall,
}: {
  riderLat: number; riderLng: number;
  destinationLat: number; destinationLng: number;
  riderName?: string | null;
  roadEtaMinutes: number | null;
  roadDistanceMeters: number | null;
  tall?: boolean;
}) {
  const distText = roadDistanceMeters
    ? roadDistanceMeters < 1000 ? `${roadDistanceMeters}m` : `${(roadDistanceMeters / 1000).toFixed(1)} km`
    : null;

  const mapsUrl = `https://www.google.com/maps/dir/${riderLat},${riderLng}/${destinationLat},${destinationLng}`;
  const mapHeight = tall ? 'min-h-[200px]' : 'min-h-[160px]';

  return (
    <div className={`rounded-xl border border-border bg-card/80 backdrop-blur-lg p-5 ${mapHeight} flex flex-col items-center justify-center gap-4 shadow-sm`}>
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <AlertTriangle size={24} className="text-muted-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">Live map unavailable</p>
        <p className="text-xs text-muted-foreground">
          {riderName ? `${riderName} is on the way` : 'Your order is on the way'}
        </p>
      </div>
      {(roadEtaMinutes || distText) && (
        <div className="flex items-center gap-4">
          {roadEtaMinutes && (
            <div className="text-center">
              <p className="text-lg font-bold text-primary">{roadEtaMinutes} min</p>
              <p className="text-[10px] text-muted-foreground">ETA</p>
            </div>
          )}
          {distText && (
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{distText}</p>
              <p className="text-[10px] text-muted-foreground">Distance</p>
            </div>
          )}
        </div>
      )}
      <Button variant="outline" size="sm" className="gap-2" asChild>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} />
          Open in Google Maps
        </a>
      </Button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DeliveryMapView({
  riderLat, riderLng, destinationLat, destinationLng,
  riderName, heading, onRoadEtaChange,
  sellerLat, sellerLng, sellerName,
  isPickedUp, tall, onRouteInfo,
}: DeliveryMapViewProps) {
  const { isLoaded, error: mapsError } = useGoogleMaps();
  const config = useTrackingConfig();
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const riderMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const sellerMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const destMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const completedPolyRef = useRef<google.maps.Polyline | null>(null);
  const remainingPolyRef = useRef<google.maps.Polyline | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const animFrameRef = useRef<number>(0);
  const userPannedRef = useRef(false);
  const initialFitDone = useRef(false);
  const [showRecenter, setShowRecenter] = useState(false);
  const [mapAuthFailed, setMapAuthFailed] = useState(false);

  const smoothedPos = useGPSSmoothing(riderLat, riderLng);

  const { routeCoords, roadEtaMinutes, roadDistanceMeters, totalRouteDistance } = useOSRMRoute(
    riderLat, riderLng, destinationLat, destinationLng,
    config.osrm_refetch_threshold_meters, config.osrm_timeout_ms,
  );

  const { completed, remaining, remainingDistance } = useRouteSplit(routeCoords, smoothedPos.lat, smoothedPos.lng);

  // Notify parent of ETA
  const prevEtaRef = useRef<number | null>(null);
  useEffect(() => {
    if (roadEtaMinutes !== prevEtaRef.current) {
      prevEtaRef.current = roadEtaMinutes;
      onRoadEtaChange?.(roadEtaMinutes);
    }
  }, [roadEtaMinutes, onRoadEtaChange]);

  // Notify parent of route info
  useEffect(() => {
    if (totalRouteDistance && remainingDistance != null) {
      onRouteInfo?.({ totalDistance: totalRouteDistance, remainingDistance });
    }
  }, [totalRouteDistance, remainingDistance, onRouteInfo]);

  // Detect Google's auth failure overlay after map init
  useEffect(() => {
    if (!mapContainerRef.current || !isLoaded) return;
    
    // MutationObserver to detect Google's error dialog injected into the map container
    const observer = new MutationObserver(() => {
      const container = mapContainerRef.current;
      if (!container) return;
      // Google injects a div with class "dismissButton" or text "This page can't load Google Maps correctly"
      const errorDialog = container.querySelector('.dismissButton') || 
        Array.from(container.querySelectorAll('div')).find(el => 
          el.textContent?.includes("can't load Google Maps correctly")
        );
      if (errorDialog) {
        console.error('DeliveryMapView: Detected Google Maps auth error overlay');
        setMapAuthFailed(true);
        observer.disconnect();
      }
    });

    observer.observe(mapContainerRef.current, { childList: true, subtree: true });
    
    // Timeout fallback — if error dialog appears within 5s
    const timeout = setTimeout(() => observer.disconnect(), 10000);
    
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [isLoaded]);

  // ─── Initialize map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapRef.current || mapAuthFailed) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: { lat: (riderLat + destinationLat) / 2, lng: (riderLng + destinationLng) / 2 },
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    });

    map.addListener('dragstart', () => {
      userPannedRef.current = true;
      setShowRecenter(true);
    });

    mapRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();

    const riderEl = document.createElement('div');
    riderEl.innerHTML = `
      <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
        <div style="width:36px;height:36px;border-radius:50%;background:hsl(var(--primary));border:3px solid hsl(var(--background));box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <span style="font-size:18px;">🛵</span>
        </div>
      </div>
    `;

    const createMarker = (opts: any) => {
      const MarkerCtor = (google.maps as any).marker?.AdvancedMarkerElement;
      if (MarkerCtor) return new MarkerCtor(opts);
      return new google.maps.Marker({
        map: opts.map,
        position: opts.position,
        title: opts.title,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" fill="#3b82f6" stroke="white" stroke-width="3"/>
              <text x="20" y="25" text-anchor="middle" font-size="16">🛵</text>
            </svg>
          `),
          scaledSize: new google.maps.Size(40, 40),
        },
      });
    };

    const riderMarker = createMarker({
      map,
      position: { lat: riderLat, lng: riderLng },
      content: riderEl,
      title: riderName || 'Delivery Partner',
    });

    riderMarker.addListener?.('click', () => {
      const distText = roadDistanceMeters
        ? roadDistanceMeters < 1000 ? `${roadDistanceMeters}m` : `${(roadDistanceMeters / 1000).toFixed(1)}km`
        : '';
      infoWindowRef.current?.setContent(`
        <div style="padding:8px;min-width:120px;text-align:center;">
          <p style="font-weight:700;font-size:14px;margin:0;">${riderName || 'Delivery Partner'}</p>
          ${roadEtaMinutes ? `<p style="font-size:12px;color:#666;margin:4px 0 0;">ETA: ${roadEtaMinutes} min</p>` : ''}
          ${distText ? `<p style="font-size:12px;color:#666;margin:2px 0 0;">${distText} away</p>` : ''}
        </div>
      `);
      infoWindowRef.current?.open({ map, anchor: riderMarker });
    });
    riderMarkerRef.current = riderMarker as any;

    const destMarker = createMarker({
      map,
      position: { lat: destinationLat, lng: destinationLng },
      title: 'Delivery Address',
    });
    destMarkerRef.current = destMarker as any;

    if (sellerLat && sellerLng) {
      const sellerMarker = createMarker({
        map,
        position: { lat: sellerLat, lng: sellerLng },
        title: sellerName || 'Restaurant',
      });
      sellerMarkerRef.current = sellerMarker as any;
    }

    completedPolyRef.current = new google.maps.Polyline({
      map,
      path: [],
      strokeColor: '#9ca3af',
      strokeWeight: 3,
      strokeOpacity: 0.4,
    });
    remainingPolyRef.current = new google.maps.Polyline({
      map,
      path: [],
      strokeColor: '#3b82f6',
      strokeWeight: 4,
      strokeOpacity: 0.85,
    });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isLoaded, mapAuthFailed]);

  // ─── Animate rider position ──────────────────────────────────────────────
  useEffect(() => {
    const marker = riderMarkerRef.current;
    if (!marker) return;

    const startPos = marker.position as google.maps.LatLngLiteral;
    if (!startPos) {
      marker.position = { lat: smoothedPos.lat, lng: smoothedPos.lng };
      return;
    }

    const startLat = startPos.lat;
    const startLng = startPos.lng;
    const endLat = smoothedPos.lat;
    const endLng = smoothedPos.lng;

    if (Math.abs(endLat - startLat) < 0.000001 && Math.abs(endLng - startLng) < 0.000001) return;

    const duration = config.map_animation_duration_ms || 1200;
    const startTime = performance.now();
    cancelAnimationFrame(animFrameRef.current);

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      marker.position = {
        lat: startLat + (endLat - startLat) * ease,
        lng: startLng + (endLng - startLng) * ease,
      };
      if (t < 1) animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [smoothedPos.lat, smoothedPos.lng]);

  // ─── Update polylines ────────────────────────────────────────────────────
  useEffect(() => {
    if (completed.length > 1) {
      completedPolyRef.current?.setPath(completed);
    }
    if (remaining.length > 1) {
      remainingPolyRef.current?.setPath(remaining);
    } else if (routeCoords.length > 0) {
      remainingPolyRef.current?.setPath(routeCoords);
    } else {
      remainingPolyRef.current?.setPath([
        { lat: smoothedPos.lat, lng: smoothedPos.lng },
        { lat: destinationLat, lng: destinationLng },
      ]);
    }
  }, [completed, remaining, routeCoords, smoothedPos.lat, smoothedPos.lng, destinationLat, destinationLng]);

  // ─── Dynamic zoom + auto camera ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const distToDestination = haversineMeters(smoothedPos.lat, smoothedPos.lng, destinationLat, destinationLng);
    let targetZoom = 14;
    if (distToDestination > 5000) targetZoom = 12;
    else if (distToDestination > 2000) targetZoom = 14;
    else if (distToDestination > 500) targetZoom = 15;
    else targetZoom = 16;

    if (!initialFitDone.current) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: smoothedPos.lat, lng: smoothedPos.lng });
      bounds.extend({ lat: destinationLat, lng: destinationLng });
      if (sellerLat && sellerLng) bounds.extend({ lat: sellerLat, lng: sellerLng });
      map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
      initialFitDone.current = true;
    } else if (!userPannedRef.current) {
      if (isPickedUp) {
        map.panTo({ lat: smoothedPos.lat, lng: smoothedPos.lng });
        if (Math.abs(map.getZoom()! - targetZoom) > 1) {
          map.setZoom(targetZoom);
        }
      } else {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: smoothedPos.lat, lng: smoothedPos.lng });
        if (sellerLat && sellerLng) bounds.extend({ lat: sellerLat, lng: sellerLng });
        else bounds.extend({ lat: destinationLat, lng: destinationLng });
        map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
      }
    }
  }, [smoothedPos.lat, smoothedPos.lng, destinationLat, destinationLng, isPickedUp]);

  // ─── Recenter handler ────────────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    userPannedRef.current = false;
    setShowRecenter(false);
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: smoothedPos.lat, lng: smoothedPos.lng });
    bounds.extend({ lat: destinationLat, lng: destinationLng });
    map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
  }, [smoothedPos.lat, smoothedPos.lng, destinationLat, destinationLng]);

  const mapHeight = tall ? 'h-[320px]' : 'h-[260px]';
  const distanceKm = roadDistanceMeters != null ? (roadDistanceMeters / 1000).toFixed(1) : null;

  // Show fallback for: no API key, auth failure, or detected error overlay
  const showFallback = mapsError || mapAuthFailed;

  if (showFallback) {
    return (
      <MapFallbackCard
        riderLat={riderLat}
        riderLng={riderLng}
        destinationLat={destinationLat}
        destinationLng={destinationLng}
        riderName={riderName}
        roadEtaMinutes={roadEtaMinutes}
        roadDistanceMeters={roadDistanceMeters}
        tall={tall}
      />
    );
  }

  if (!isLoaded) {
    return (
      <div className={`rounded-xl overflow-hidden border border-border ${mapHeight} bg-muted flex items-center justify-center`}>
        <div className="text-center text-muted-foreground">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-xs">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border border-border ${mapHeight} relative shadow-sm transition-all duration-500`}>
      {/* Map container */}
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* ETA Overlay */}
      {roadEtaMinutes && (
        <div className="absolute bottom-2.5 right-2.5 z-10 bg-background/90 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-md">
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
        </div>
      )}

      {/* Recenter button */}
      {showRecenter && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-3 left-3 z-10 bg-background/95 backdrop-blur-sm border border-border rounded-full p-2.5 shadow-lg hover:bg-accent transition-all active:scale-90"
          aria-label="Re-center map"
        >
          <Navigation className="h-4 w-4 text-primary" />
        </button>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes dest-pulse-gm {
          0% { transform: translateX(-50%) scale(0.8); opacity: 1; }
          100% { transform: translateX(-50%) scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
