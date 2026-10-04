import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export const RANK_HOURS = '06:30–19:30 daily';
const osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const credit = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const cartoKey = import.meta.env.VITE_CARTO_BASEMAP_KEY;
const tiles = cartoKey ? 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=' + encodeURIComponent(cartoKey) : osm;
const attribution = credit + (cartoKey ? ' &copy; <a href="https://carto.com/attribution/">CARTO</a>' : '');

export default function ThembaMap({ markers = [], polylines = [], height = '380px', initialCenter = [-28.8, 31.95], initialZoom = 11, onMapClick, fitKey, className = '' }) {
  const container = useRef(null), map = useRef(null), layers = useRef(null), bounds = useRef(null), rankLayers = useRef({});
  const click = useRef(onMapClick);
  const [fallback, setFallback] = useState(false);
  click.current = onMapClick;
  function fit() {
    if (map.current && bounds.current) {
      map.current.invalidateSize({pan: false});
      map.current.fitBounds(bounds.current, {padding: [42, 42], maxZoom: 15});
    }
  }
  useEffect(() => {
    const instance = L.map(container.current, {zoomControl: false, scrollWheelZoom: false}).setView(initialCenter, initialZoom);
    L.control.zoom({position: 'bottomright'}).addTo(instance);
    L.control.scale({imperial: false, position: 'bottomleft'}).addTo(instance);
    const tileLayer = L.tileLayer(tiles, {attribution, maxZoom: 19, className: 'themba-basemap'}).addTo(instance);
    let errors = 0, switched = false;
    tileLayer.on('tileerror', () => {
      errors += 1;
      if (cartoKey && !switched && errors >= 3) {
        switched = true; instance.removeLayer(tileLayer);
        L.tileLayer(osm, {attribution: credit, maxZoom: 19}).addTo(instance);
        setFallback(true);
      }
    });
    layers.current = L.layerGroup().addTo(instance);
    instance.on('click', e => click.current?.({lat: e.latlng.lat, lng: e.latlng.lng}));
    map.current = instance;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.invalidateSize({pan: false})) : null;
    observer?.observe(container.current);
    return () => {observer?.disconnect(); instance.remove(); map.current = null;};
  }, []);
  useEffect(() => {
    if (!map.current || !layers.current) return;
    layers.current.clearLayers(); rankLayers.current = {};
    const points = [];
    for (const line of polylines) {
      const positions = (line.positions || []).filter(p => Array.isArray(p) && p.length === 2 && p.every(v => v !== null && v !== '' && Number.isFinite(Number(v))));
      if (positions.length < 2) continue;
      L.polyline(positions, {color: '#fff', weight: 10, opacity: .95, interactive: false}).addTo(layers.current);
      L.polyline(positions, {color: line.color || '#18834b', weight: line.weight || 5, dashArray: line.dashed ? '6 6' : undefined, lineCap: 'round'}).addTo(layers.current);
      points.push(...positions);
    }
    for (const marker of markers) {
      if ([marker.lat, marker.lng].some(v => v === null || v === undefined || v === '')) continue;
      const position = [Number(marker.lat), Number(marker.lng)];
      if (!position.every(Number.isFinite)) continue;
      const isRank = ['rank', 'destination'].includes(marker.kind);
      const element = document.createElement('span');
      element.className = 'map-pin ' + (marker.kind === 'destination' ? 'map-pin-destination' : '');
      element.textContent = marker.kind === 'rank' ? 'A' : marker.kind === 'destination' ? 'B' : '●';
      const item = L.marker(position, {icon: L.divIcon({className: 'map-pin-wrap', html: element, iconSize: [34, 34], iconAnchor: [17, 17]}),
        title: marker.label || 'Location', alt: marker.label || 'Location', keyboard: true}).addTo(layers.current);
      const label = document.createElement('span'); label.textContent = marker.label || 'Location';
      item.bindTooltip(label, {direction: 'top', offset: [0, -18]});
      if (isRank) {
        const popup = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = marker.label || 'Taxi rank';
        const hours = document.createElement('p'); hours.textContent = 'Operating hours: ' + RANK_HOURS;
        const note = document.createElement('small'); note.textContent = 'South Africa time · daily';
        popup.append(title, hours, note); item.bindPopup(popup); rankLayers.current[marker.id] = item;
      }
      points.push(position);
    }
    bounds.current = points.length ? L.latLngBounds(points) : null;
    fit();
  }, [markers, polylines, fitKey]);
  return <div className={'modern-map ' + className}>
    <div className="map-toolbar"><span><i className="live-dot" /> Journey overview</span><button type="button" className="secondary-button" onClick={fit}>Fit route</button></div>
    <div ref={container} className="modern-map-canvas" style={{height, width: '100%'}} aria-label="Trip map with clickable rank operating hours" />
    <div className="map-rank-list">{markers.filter(m => ['rank', 'destination'].includes(m.kind)).map(m =>
      <button key={m.id} type="button" className="map-rank-card" aria-label={m.label + " operating hours"} onClick={() => rankLayers.current[m.id]?.openPopup()}>
        <span className="rank-letter">{m.kind === 'rank' ? 'A' : 'B'}</span><span><strong>{m.label}</strong><small>Tap for operating hours</small></span>
      </button>)}</div>
    {fallback && <p className="muted">Standard street map shown while the alternative map is unavailable.</p>}
    <p className="map-help">Select a rank marker for its hours. Drag to explore; use + and − to zoom.</p>
  </div>;
}
