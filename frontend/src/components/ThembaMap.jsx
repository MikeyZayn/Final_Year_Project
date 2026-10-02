import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Shared map contract for the dashboards; no Google billing/key required.
export default function ThembaMap({ markers = [], polylines = [], height = '280px', initialCenter = [-28.8, 31.95], initialZoom = 11, onMapClick, fitKey, className = '' }) {
  const container = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const click = useRef(onMapClick);
  click.current = onMapClick;
  useEffect(() => {
    const instance = L.map(container.current).setView(initialCenter, initialZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event) => click.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current || !layers.current) return;
    layers.current.clearLayers();
    const points = [];
    for (const marker of markers) {
      const position = [Number(marker.lat), Number(marker.lng)];
      if (!position.every(Number.isFinite)) continue;
      const item = L.circleMarker(position, { radius: 8, color: marker.color || '#2563eb', fillOpacity: 0.9 }).addTo(layers.current);
      if (marker.label) { const label = document.createElement('span'); label.textContent = marker.label; item.bindTooltip(label); }
      points.push(position);
    }
    for (const line of polylines) {
      const positions = (line.positions || []).filter(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(Number(v))));
      if (positions.length < 2) continue;
      L.polyline(positions, { color: line.color || '#2563eb', weight: line.weight || 4, dashArray: line.dashed ? '6 6' : undefined }).addTo(layers.current);
      points.push(...positions);
    }
    if (points.length) map.current.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 15 });
    map.current.invalidateSize();
  }, [markers, polylines, fitKey]);
  return <div ref={container} className={className} style={{ height, width: '100%' }} aria-label="Trip map" />;
}
