import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import ThembaMap from '../components/ThembaMap.jsx';

export default function DriverPage({ notify }) {
  const [vehicle, setVehicle] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [last, setLast] = useState(null);
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tripCodeInput, setTripCodeInput] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');

  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const latestPos = useRef(null);

  useEffect(() => {
    api
      .myVehicle()
      .then(setVehicle)
      .catch((e) => notify?.(e.message));

    api
      .driverTrips()
      .then((rows) => {
        setTrips(rows);
        const active =
          rows.find((t) => ['boarding', 'in_progress'].includes(t.status)) ||
          rows.find((t) => t.status === 'scheduled') ||
          null;
        setActiveTrip(active);
      })
      .catch(() => setTrips([]));

    api
      .driverProfile()
      .then(setProfile)
      .catch(() => setProfile(null));

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
        trip_id: activeTrip?.id,
      };
      const res = await api.postLocation(vehicle.id, payload);
      setLast(res);
    } catch (e) {
      notify?.(e.message);
    }
  }

  function startTracking() {
    if (!vehicle) {
      notify?.('No vehicle assigned');
      return;
    }
    if (!navigator.geolocation) {
      notify?.('Geolocation not available');
      return;
    }
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = pos.coords;
      },
      (err) => notify?.(err.message),
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
      (err) => notify?.(err.message)
    );
  }

  async function handleConfirmTrip() {
    setConfirmMsg('');
    try {
      const trip = await api.confirmTrip(tripCodeInput.trim());
      setActiveTrip(trip);
      setTrips((prev) => {
        const without = prev.filter((t) => t.id !== trip.id);
        return [trip, ...without];
      });
      setTripCodeInput('');
      setConfirmMsg(`Confirmed: ${trip.trip_code}`);
    } catch (e) {
      setConfirmMsg(e.message || 'Could not confirm trip.');
    }
  }

  // ----- Map data -----
  const geom = activeTrip?.route?.geometry || [];
  const polylines =
    geom.length >= 2
      ? [{ id: 'route', positions: geom, color: '#2563eb', weight: 5 }]
      : [];

  const markers = [];
  if (last) {
    markers.push({
      id: 'me',
      lat: last.lat,
      lng: last.lng,
      kind: 'vehicle',
      label: vehicle?.plate_number,
    });
  }
  if (activeTrip?.route?.departure?.latitude && activeTrip?.route?.departure?.longitude) {
    markers.push({
      id: 'dep',
      lat: Number(activeTrip.route.departure.latitude),
      lng: Number(activeTrip.route.departure.longitude),
      kind: 'rank',
      label: activeTrip.route.departure.name,
    });
  }
  if (
    activeTrip?.route?.destination?.latitude &&
    activeTrip?.route?.destination?.longitude
  ) {
    markers.push({
      id: 'dest',
      lat: Number(activeTrip.route.destination.latitude),
      lng: Number(activeTrip.route.destination.longitude),
      kind: 'destination',
      label: activeTrip.route.destination.name,
    });
  }

  return (
    <div className="grid">
      {/* ---------- Profile panel ---------- */}
      <section className="card wide">
        <h2>Profile</h2>
        {profile ? (
          <>
            <p>
              <strong>
                {profile.user.first_name} {profile.user.last_name}
              </strong>{' '}
              · {profile.user.phone}
            </p>
            <p>
              License: <strong>{profile.license_number}</strong> · Status:{' '}
              {profile.status}
            </p>
            <p>
              Rating:{' '}
              {profile.rating_avg != null
                ? `${profile.rating_avg} / 5 (${profile.rating_count})`
                : 'No ratings yet'}
            </p>
            <p>
              Complaints: {profile.complaint_count} total ·{' '}
              {profile.open_complaints} open
            </p>
            <h3>Notifications</h3>
            <ul>
              {profile.notifications.map((n) => (
                <li key={n.id}>
                  <strong>{n.title}</strong> — {n.body}
                </li>
              ))}
              {profile.notifications.length === 0 && <li>No notifications.</li>}
            </ul>
          </>
        ) : (
          <p className="muted">Loading profile…</p>
        )}
      </section>

      {/* ---------- Confirm trip by code ---------- */}
      <section className="card">
        <h2>Confirm trip</h2>
        <input
          type="text"
          placeholder="Enter trip verification code"
          value={tripCodeInput}
          onChange={(e) => setTripCodeInput(e.target.value)}
        />
        <button
          type="button"
          onClick={handleConfirmTrip}
          disabled={!tripCodeInput.trim()}
        >
          Confirm trip
        </button>
        {confirmMsg && <p className="muted small">{confirmMsg}</p>}
      </section>

      {/* ---------- My trips ---------- */}
      <section className="card">
        <h2>My trips</h2>
        <ul>
          {trips.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setActiveTrip(t)}>
                {t.trip_code} ·{' '}
                {t.route?.name ||
                  `${t.route?.departure?.name} → ${t.route?.destination?.name}`}{' '}
                · {t.departure_date} · {t.status}
              </button>
            </li>
          ))}
          {trips.length === 0 && <li>No trips registered.</li>}
        </ul>
      </section>

      {/* ---------- Map ---------- */}
      <section className="card wide">
        <h2>Map</h2>
        <ThembaMap
          markers={markers}
          polylines={polylines}
          height="320px"
          fitKey={activeTrip ? `t-${activeTrip.id}-${last?.lat ?? 0}` : '0'}
        />
      </section>

      {/* ---------- My vehicle + GPS controls ---------- */}
      <section className="card">
        <h2>My vehicle</h2>
        {vehicle ? (
          <p>
            <strong>{vehicle.plate_number}</strong> · {vehicle.make}{' '}
            {vehicle.model} · {vehicle.seat_capacity} seats · {vehicle.status}
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
        </div>
        <p className="muted small">
          Live GPS pushes every ~7s. Operator map updates over WebSocket / polling.
        </p>
      </section>

      {/* ---------- Trip information ---------- */}
      {activeTrip && (
        <section className="card">
          <h2>Trip information</h2>
          <p>
            <strong>Code:</strong> {activeTrip.trip_code}
          </p>
          <p>
            <strong>Route:</strong>{' '}
            {activeTrip.route?.name ||
              `${activeTrip.route?.departure?.name} → ${activeTrip.route?.destination?.name}`}
          </p>
          <p>
            <strong>Driver:</strong> {activeTrip.driver_name || '—'}
          </p>
          <p>
            <strong>Vehicle:</strong> {activeTrip.vehicle_plate || '—'}
          </p>
          <p>
            <strong>Status:</strong> {activeTrip.status}
          </p>
          <p>
            <strong>Seats:</strong> {activeTrip.seats_taken}/
            {activeTrip.seat_capacity}
          </p>
        </section>
      )}

      {/* ---------- Last server response ---------- */}
      {last && (
        <section className="card">
          <h2>Last server response</h2>
          <dl className="kv">
            <dt>Route status</dt>
            <dd className={last.route_status === 'off_route' ? 'warn' : ''}>
              {last.route_status}
            </dd>
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