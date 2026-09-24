/**
 * Google Maps map for THEMBA.
 * Polylines: [{ id, positions, color?, dashed?, weight? }]
 * Markers:   [{ id, lat, lng, label?, color?, kind? }]
 * onMapClick({lat,lng}); onMarkerClick(marker) — when provided, replaces InfoWindow.
 */
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../services/googleMapsLoader';

const KIND_COLORS = {
  rank: '#0f766e',
  dest: '#b45309',
  vehicle: '#1d4ed8',
  user: '#7c3aed',
  you: '#38bdf8',
  default: '#334155',
};

const DEFAULT_CENTER = { lat: -28.8, lng: 31.95 };
const DEFAULT_ZOOM = 11;

function pinIcon(maps, color) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  };
}

function safeCleanupOverlay(overlay) {
  try {
    if (overlay && typeof overlay.setMap === 'function') overlay.setMap(null);
  } catch {
    /* ignore */
  }
}

function toLatLng(p) {
  if (Array.isArray(p) && p.length >= 2) {
    const lat = +p[0];
    const lng = +p[1];
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (p && typeof p === 'object') {
    const lat = +p.lat;
    const lng = +p.lng;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  return null;
}

export default function ThembaMap({
  polylines = [],
  markers = [],
  height = '280px',
  initialCenter = [-28.8, 31.95],
  initialZoom = DEFAULT_ZOOM,
  onMapClick,
  onMarkerClick,
  fitKey,
  className = '',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const infoWindowsRef = useRef([]);
  const clickListenerRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const onMarkerClickRef = useRef(onMarkerClick);
  onMapClickRef.current = onMapClick;
  onMarkerClickRef.current = onMarkerClick;

  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (typeof loadGoogleMaps !== 'function') {
      setLoadError('googleMapsLoader is missing.');
      setStatus('error');
      return undefined;
    }
    Promise.resolve(loadGoogleMaps())
      .then((maps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const center = Array.isArray(initialCenter)
          ? { lat: +initialCenter[0], lng: +initialCenter[1] }
          : initialCenter || DEFAULT_CENTER;
        const map = new maps.Map(containerRef.current, {
          center,
          zoom: initialZoom ?? DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError((err && err.message) || String(err));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return undefined;
    const maps = window.google && window.google.maps;
    if (!maps) return undefined;

    if (clickListenerRef.current) {
      try {
        maps.event.removeListener(clickListenerRef.current);
      } catch {
        /* ignore */
      }
      clickListenerRef.current = null;
    }

    if (onMapClickRef.current) {
      clickListenerRef.current = map.addListener('click', (event) => {
        onMapClickRef.current?.({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
    }

    return () => {
      if (clickListenerRef.current) {
        try {
          maps.event.removeListener(clickListenerRef.current);
        } catch {
          /* ignore */
        }
        clickListenerRef.current = null;
      }
    };
  }, [status, onMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    const maps = window.google && window.google.maps;
    if (!maps) return;

    infoWindowsRef.current.forEach((iw) => {
      try {
        iw.close();
      } catch {
        /* ignore */
      }
    });
    infoWindowsRef.current = [];

    overlaysRef.current.forEach(safeCleanupOverlay);
    overlaysRef.current = [];

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;

    polylines.forEach((line) => {
      const path = (line.positions || []).map(toLatLng).filter(Boolean);
      if (path.length < 2) return;

      const color = line.color || '#0f766e';
      const weight = line.weight ?? 4;

      const dashedIcons = line.dashed
        ? [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.9,
                strokeColor: color,
                scale: 3,
              },
              offset: '0',
              repeat: '14px',
            },
          ]
        : undefined;

      const pl = new maps.Polyline({
        path,
        map,
        strokeColor: color,
        strokeOpacity: line.dashed ? 0 : 0.9,
        strokeWeight: weight,
        ...(dashedIcons ? { icons: dashedIcons } : {}),
      });

      overlaysRef.current.push(pl);
      path.forEach((pt) => {
        bounds.extend(pt);
        hasBounds = true;
      });
    });

    markers.forEach((m) => {
      const lat = +m.lat;
      const lng = +m.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const color = m.color || KIND_COLORS[m.kind] || KIND_COLORS.default;
      const marker = new maps.Marker({
        map,
        position: { lat, lng },
        title: m.label ? String(m.label).replace(/<br\/?>/gi, ' · ') : undefined,
        icon: pinIcon(maps, color),
      });

      if (m.label) {
        const info = new maps.InfoWindow({
          content: `<div style="font:12px/1.4 system-ui,sans-serif">${m.label}</div>`,
        });
        marker.addListener('click', () => {
          if (typeof onMarkerClickRef.current === 'function') {
            onMarkerClickRef.current(m);
          } else {
            info.open({ map, anchor: marker });
          }
        });
        infoWindowsRef.current.push(info);
      }

      overlaysRef.current.push(marker);
      bounds.extend({ lat, lng });
      hasBounds = true;
    });

    if (hasBounds) {
      try {
        map.fitBounds(bounds, 40);
        const z = map.getZoom();
        if (z > 14) map.setZoom(14);
      } catch {
        /* ignore */
      }
    }
  }, [polylines, markers, fitKey, status]);

  useEffect(
    () => () => {
      infoWindowsRef.current.forEach((iw) => {
        try {
          iw.close();
        } catch {
          /* ignore */
        }
      });
      infoWindowsRef.current = [];
      overlaysRef.current.forEach(safeCleanupOverlay);
      overlaysRef.current = [];
    },
    []
  );

  if (status === 'error') {
    return (
      <div
        className={`themba-map themba-map-error ${className}`}
        style={{
          height,
          width: '100%',
          borderRadius: 10,
          padding: '1rem',
          background: '#fef2f2',
          color: '#991b1b',
          fontSize: '0.9rem',
        }}
      >
        <strong>Map unavailable</strong>
        <p style={{ margin: '0.5rem 0 0' }}>{loadError}</p>
        <p style={{ margin: '0.5rem 0 0', opacity: 0.85 }}>
          Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>frontend/.env</code> and allow this
          origin under the key’s Website restrictions.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height, width: '100%' }} className={className}>
      {status === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: '#e2e8f0',
            borderRadius: 10,
            zIndex: 1,
            fontSize: '0.9rem',
            color: '#475569',
          }}
        >
          Loading Google Maps…
        </div>
      )}
      <div
        ref={containerRef}
        className="themba-map"
        style={{ height: '100%', width: '100%', borderRadius: 10, overflow: 'hidden' }}
      />
    </div>
  );
}

export function overlaysFromTrip(trip) {
  if (!trip?.route) return { polylines: [], markers: [] };
  const r = trip.route;
  const geom = Array.isArray(r.geometry) ? r.geometry : [];
  const polylines =
    geom.length >= 2
      ? [{ id: `route-${r.id}`, positions: geom, color: '#0f766e' }]
      : [];
  const markers = [];
  if (r.departure?.latitude != null && r.departure?.longitude != null) {
    markers.push({
      id: `dep-${r.id}`,
      lat: +r.departure.latitude,
      lng: +r.departure.longitude,
      label: r.departure.name,
      kind: 'rank',
    });
  }
  if (r.destination?.latitude != null && r.destination?.longitude != null) {
    markers.push({
      id: `dest-${r.id}`,
      lat: +r.destination.latitude,
      lng: +r.destination.longitude,
      label: r.destination.name,
      kind: 'dest',
    });
  }
  return { polylines, markers };
}

export function markersFromFleet(fleet) {
  return (fleet || [])
    .filter((f) => f.location?.lat != null)
    .map((f) => ({
      id: `v-${f.vehicle.id}`,
      lat: f.location.lat,
      lng: f.location.lng,
      label: `${f.vehicle.plate_number}<br/>${
        f.location.speed_kmh != null ? `${Math.round(f.location.speed_kmh)} km/h` : ''
      }`,
      kind: 'vehicle',
    }));
}

export function polylineFromDirections(data, id = 'adhoc') {
  if (!data?.geometry || data.geometry.length < 2) return null;
  return {
    id,
    positions: data.geometry,
    color: '#d97706',
    dashed: true,
    weight: 4,
  };
}