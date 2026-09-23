import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import ThembaMap from '../components/ThembaMap.jsx';

export default function DriverPage({ notify }) {
  const [vehicle, setVehicle] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [last, setLast] = useState(null);
  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const latestPos = useRef(null);

  useEffect(() => {
    api
      .myVehicle()
      .then(setVehicle)
      .catch((e) => notify(e.message));
    return () => stopTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTracking() {
    if (watchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTracking(false);
  }

  async function pushOnce(coords) {
    if (!vehicle) return;
    try {
      const payload = {
        lat: coords.latitude,
        lng: coords.longitude,
        speed_kmh: coords.speed != null ? coords.speed * 3.6 : null,
        heading_deg: coords.heading || 0,
        accuracy_m: coords.accuracy || 0,
        source: 'gps',
      };
      const res = await api.postLocation(vehicle.id, payload);
      setLast(res);
    } catch (e) {
      notify(e.message);
    }
  }

  function startTracking() {
    if (!vehicle) {
      notify('No vehicle assigned');
      return;
    }
    if (!navigator.geolocation) {
      notify('Geolocation not available');
      return;
    }
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = pos.coords;
      },
      (err) => notify(err.message),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    timerRef.current = setInterval(() => {
      if (latestPos.current) pushOnce(latestPos.current);
    }, 7000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latestPos.current = pos.coords;
        pushOnce(pos.coords);
      },
      (err) => notify(err.message)
    );
  }

  async function simulateNearOngoye() {
    if (!vehicle) return;
    try {
      const res = await api.postLocation(vehicle.id, {
        lat: -28.854,
        lng: 31.846,
        speed_kmh: 25,
        heading_deg: 90,
        accuracy_m: 12,
        source: 'simulated',
      });
      setLast(res);
      notify(`Simulated ping · ${res.route_status}`);
    } catch (e) {
      notify(e.message);
    }
  }

  const markers = last
    ? [{ id: 'me', lat: last.lat, lng: last.lng, kind: 'vehicle', label: vehicle?.plate_number }]
    : [];

  return (
    <div className="grid">
      <section className="card wide">
        <h2>Position</h2>
        <ThembaMap markers={markers} height="260px" fitKey={last ? `${last.lat},${last.lng}` : '0'} />
      </section>

      <section className="card">
        <h2>My vehicle</h2>
        {vehicle ? (
          <p>
            <strong>{vehicle.plate_number}</strong> · {vehicle.make} {vehicle.model} ·{' '}
            {vehicle.seat_capacity} seats · {vehicle.status}
          </p>
        ) : (
          <p className="muted">Loading vehicle…</p>
        )}
        <div className="row">
          {!tracking ? (
            <button type="button" onClick={startTracking} disabled={!vehicle}>
              Start trip GPS
            </button>
          ) : (
            <button type="button" className="danger" onClick={stopTracking}>
              Stop GPS
            </button>
          )}
          <button type="button" className="secondary" onClick={simulateNearOngoye} disabled={!vehicle}>
            Simulate near Ongoye
          </button>
        </div>
        <p className="muted small">
          Live GPS pushes every ~7s. Operator map updates over WebSocket / polling.
        </p>
      </section>

      {last && (
        <section className="card">
          <h2>Last server response</h2>
          <dl className="kv">
            <dt>Route status</dt>
            <dd className={last.route_status === 'off_route' ? 'warn' : ''}>{last.route_status}</dd>
            <dt>Distance from route</dt>
            <dd>
              {last.distance_from_route_m != null
                ? `${Math.round(last.distance_from_route_m)} m`
                : '—'}
            </dd>
            <dt>Position</dt>
            <dd>
              {last.lat?.toFixed?.(5)}, {last.lng?.toFixed?.(5)}
            </dd>
            <dt>Trip</dt>
            <dd>{last.trip_id ?? '—'}</dd>
          </dl>
        </section>
      )}
    </div>
  );
}
