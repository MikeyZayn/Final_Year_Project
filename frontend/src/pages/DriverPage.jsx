/**
 * Driver console — 3 stages:
 *   Stage 1: Ready for dispatch (verification, trip code, My trips, notifications)
 *   Stage 2: Selected trip map panel (route polyline, trip info, dot bar)
 *   Stage 3: Selected route point (sidebar list + floating point card)
 *
 * Transitions:
 *   Stage 1 → 2 : openTrip(trip)   (click a My-trips row)
 *   Stage 2 → 3 : selectPoint(p)   (dot bar, marker click, list)
 *   Stage 3 → 2 : backToTripInfo() (× on card, "Back to trip info")
 *   Stage 2/3 → 1 : backToList()   (← in header)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getUser } from '../api';
import ThembaMap from '../components/ThembaMap';
import '../styles/driverConsole.css';

function fmtTime(t) {
  if (!t) return '—';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function statusLabel(s) {
  return String(s || 'scheduled').replace(/_/g, ' ');
}

/** Route points: real RouteStop rows → else departure/destination + geometry samples. */
function buildRoutePoints(trip) {
  const route = trip?.route;
  if (!route) return [];

  const stops = Array.isArray(route.stops) ? [...route.stops] : [];
  if (stops.length >= 2) {
    return stops
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s, i) => ({
        id: s.id ?? i,
        order: i + 1,
        name: s.name || `Stop ${i + 1}`,
        lat: Number(s.lat ?? s.latitude),
        lng: Number(s.lng ?? s.longitude),
        scheduled: s.scheduled_time || s.eta || null,
        note: s.note || s.operational_note || '',
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  const pts = [];
  const dep = route.departure;
  const dest = route.destination;

  if (dep?.latitude != null) {
    pts.push({
      id: 'dep',
      order: 1,
      name: `${dep.name || 'Departure'} depot`,
      lat: Number(dep.latitude),
      lng: Number(dep.longitude),
      scheduled: trip.expected_departure_time,
      note: 'Boarding / departure rank',
    });
  }

  const geom = Array.isArray(route.geometry) ? route.geometry : [];
  if (geom.length > 4) {
    const midIdx = [Math.floor(geom.length * 0.33), Math.floor(geom.length * 0.66)];
    midIdx.forEach((idx, n) => {
      const g = geom[idx];
      if (!Array.isArray(g) || g.length < 2) return;
      pts.push({
        id: `mid-${n}`,
        order: pts.length + 1,
        name: n === 0 ? 'Mid corridor' : 'Approach',
        lat: Number(g[0]),
        lng: Number(g[1]),
        scheduled: null,
        note: 'Tap for corridor checkpoint',
      });
    });
  }

  if (dest?.latitude != null) {
    pts.push({
      id: 'dest',
      order: pts.length + 1,
      name: `${dest.name || 'Destination'} terminus`,
      lat: Number(dest.latitude),
      lng: Number(dest.longitude),
      scheduled: null,
      note: 'Final drop-off',
    });
  }

  if (!pts.length && dep?.name && dest?.name) {
    pts.push(
      {
        id: 'dep',
        order: 1,
        name: `${dep.name} depot`,
        lat: Number(dep.latitude) || -28.854,
        lng: Number(dep.longitude) || 31.846,
        scheduled: trip.expected_departure_time,
        note: 'Departure rank',
      },
      {
        id: 'dest',
        order: 2,
        name: `${dest.name} terminus`,
        lat: Number(dest.latitude) || -28.7808,
        lng: Number(dest.longitude) || 31.8925,
        scheduled: null,
        note: 'Destination rank',
      }
    );
  }

  return pts;
}

export default function DriverPage({ notify }) {
  const user = getUser();
  const driverName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'Driver';

  const [vehicle, setVehicle] = useState(null);
  const [profile, setProfile] = useState(null);
  const [trips, setTrips] = useState([]);
  const [tripCodeInput, setTripCodeInput] = useState('');
  const [matchedCode, setMatchedCode] = useState('');
  const [confirming, setConfirming] = useState(false);

  // ---- Stage control ----
  // selectedTrip === null                                  → Stage 1
  // selectedTrip !== null && selectedPoint === null        → Stage 2
  // selectedTrip !== null && selectedPoint !== null        → Stage 3
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const [tracking, setTracking] = useState(false);
  const [lastGps, setLastGps] = useState(null);

  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const latestPos = useRef(null);
  const selectedTripRef = useRef(null);
  selectedTripRef.current = selectedTrip;

  async function refreshTrips() {
    try {
      const rows = await api.driverTrips();
      setTrips(Array.isArray(rows) ? rows : []);
      return rows;
    } catch {
      setTrips([]);
      return [];
    }
  }

  async function refreshProfile() {
    try {
      const p = await api.driverProfile();
      setProfile(p);
    } catch {
      /* keep last known */
    }
  }

  useEffect(() => {
    api.myVehicle().then(setVehicle).catch((e) => notify?.(e.message));
    refreshProfile();
    refreshTrips();
    const id = setInterval(refreshProfile, 45000);
    return () => {
      clearInterval(id);
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Notifications ----------
  async function markNotificationRead(id) {
    try {
      await api.notificationsMarkRead(id);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              notifications: (prev.notifications || []).map((n) =>
                n.id === id ? { ...n, read: true } : n
              ),
            }
          : prev
      );
    } catch (e) {
      notify?.(e.message);
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api.notificationsMarkAllRead();
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              notifications: (prev.notifications || []).map((n) => ({
                ...n,
                read: true,
              })),
            }
          : prev
      );
      notify?.('All notifications marked as read.');
    } catch (e) {
      notify?.(e.message);
    }
  }

  // ---------- GPS ----------
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
    if (!vehicle?.id) return;
    try {
      const payload = {
        lat: coords.latitude,
        lng: coords.longitude,
        speed_kmh: coords.speed != null ? coords.speed * 3.6 : null,
        heading_deg: coords.heading || 0,
        accuracy_m: coords.accuracy || 0,
        source: 'gps',
        trip_id: selectedTripRef.current?.id,
      };
      const res = await api.postLocation(vehicle.id, payload);
      setLastGps({
        lat: coords.latitude,
        lng: coords.longitude,
        at: new Date().toISOString(),
        route_status: res?.route_status,
      });
    } catch (e) {
      notify?.(e.message);
    }
  }

  function startTracking() {
    if (!vehicle) {
      notify?.('No vehicle assigned. Link a vehicle first.');
      return;
    }
    if (!navigator.geolocation) {
      notify?.('Geolocation not available on this device.');
      return;
    }
    stopTracking();
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = pos.coords;
      },
      (err) => notify?.(err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    timerRef.current = setInterval(() => {
      if (latestPos.current) pushOnce(latestPos.current);
    }, 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latestPos.current = pos.coords;
        pushOnce(pos.coords);
      },
      () => {},
      { enableHighAccuracy: true }
    );
    notify?.('Live GPS sharing started for this shift.');
  }

  // ---------- Stage 1 action: confirm trip code ----------
  async function handleConfirmTrip() {
    const code = tripCodeInput.trim();
    if (!code) {
      notify?.('Enter the trip code from the operator / manifest.');
      return;
    }
    setConfirming(true);
    try {
      const trip = await api.confirmTrip(code);
      setMatchedCode(trip.trip_code || code.toUpperCase());
      await refreshTrips();
      notify?.(
        `Trip ${trip.trip_code} matched — select it from My trips to open the map.`
      );
      setTripCodeInput('');
    } catch (e) {
      notify?.(e.message || 'Could not confirm trip code.');
    } finally {
      setConfirming(false);
    }
  }

  // ---------- Stage transitions ----------
  function openTrip(trip) {
    setSelectedTrip(trip);
    setSelectedPoint(null);
  }

  function selectPoint(point) {
    setSelectedPoint(point);
  }

  function backToTripInfo() {
    setSelectedPoint(null);
  }

  function backToList() {
    setSelectedTrip(null);
    setSelectedPoint(null);
  }

  const routePoints = useMemo(
    () => (selectedTrip ? buildRoutePoints(selectedTrip) : []),
    [selectedTrip]
  );

  const mapOverlays = useMemo(() => {
    if (!selectedTrip) return { polylines: [], markers: [] };
    const route = selectedTrip.route || {};
    const geom = Array.isArray(route.geometry) ? route.geometry : [];
    const polylines = [];
    if (geom.length >= 2) {
      polylines.push({
        id: 'driver-route',
        positions: geom,
        color: '#e6a841',
        weight: 5,
      });
    } else if (routePoints.length >= 2) {
      polylines.push({
        id: 'driver-route-stops',
        positions: routePoints.map((p) => [p.lat, p.lng]),
        color: '#e6a841',
        weight: 5,
      });
    }

    const markers = routePoints.map((p) => ({
      id: `rp-${p.id}`,
      lat: p.lat,
      lng: p.lng,
      label: `${String(p.order).padStart(2, '0')} · ${p.name}`,
      kind: 'rank',
      color: selectedPoint?.id === p.id ? '#f5a524' : '#0f766e',
    }));

    if (lastGps?.lat != null) {
      markers.push({
        id: 'driver-live',
        lat: lastGps.lat,
        lng: lastGps.lng,
        label: 'You (live GPS)',
        kind: 'vehicle',
        color: '#22c55e',
      });
    }

    return { polylines, markers };
  }, [selectedTrip, routePoints, selectedPoint, lastGps]);

  const progressPct = useMemo(() => {
    if (!routePoints.length || !selectedPoint) {
      if (selectedTrip?.status === 'in_progress') return 38;
      if (selectedTrip?.status === 'boarding') return 12;
      if (selectedTrip?.status === 'completed') return 100;
      return 0;
    }
    return Math.round((selectedPoint.order / routePoints.length) * 100);
  }, [routePoints, selectedPoint, selectedTrip]);

  /* ================= Stage 2 & 3 — Selected trip map panel ================= */
  if (selectedTrip) {
    const from = selectedTrip.route?.departure?.name || '—';
    const to = selectedTrip.route?.destination?.name || '—';
    const plate =
      selectedTrip.vehicle_plate ||
      selectedTrip.vehicle?.plate_number ||
      vehicle?.plate_number ||
      '—';

    return (
      <div className="drv-shell">
        <header className="drv-topbar">
          <div className="drv-brand">
            <span className="drv-logo">FL</span>
            <div>
              <strong>FIELDLINE</strong>
              <small>LIVE ROUTE</small>
            </div>
          </div>
          <div className="drv-top-meta">
            <span className="drv-live-dot" /> SYSTEM LIVE
            <span className="drv-user-chip">{driverName}</span>
          </div>
        </header>

        <div className="drv-trip-header">
          <button type="button" className="drv-back" onClick={backToList} title="Back to trips">
            ←
          </button>
          <div>
            <h1>
              {from} → {to}
            </h1>
            <small>
              {selectedTrip.trip_code}
              {selectedTrip.departure_date ? ` · ${selectedTrip.departure_date}` : ''}
              {selectedTrip.expected_departure_time
                ? ` · ${fmtTime(selectedTrip.expected_departure_time)}`
                : ''}
              {selectedPoint
                ? ` · ROUTE POINT ${String(selectedPoint.order).padStart(2, '0')}`
                : ''}
            </small>
          </div>
          <span className={`drv-pill status-${selectedTrip.status}`}>
            {statusLabel(selectedTrip.status)}
          </span>
        </div>

        <div className="drv-trip-layout">
          <aside className="drv-side">
            {!selectedPoint ? (
              /* ---------- Stage 2 sidebar ---------- */
              <>
                <p className="drv-kicker">ACTIVE ASSIGNMENT</p>
                <h2>Trip information</h2>
                <dl className="drv-dl">
                  <div>
                    <dt>Driver</dt>
                    <dd>
                      {driverName}
                      {user?.phone ? ` · ${user.phone}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Vehicle</dt>
                    <dd>{plate}</dd>
                  </div>
                  <div className="drv-dl-row">
                    <div>
                      <dt>Departure</dt>
                      <dd>{fmtTime(selectedTrip.expected_departure_time)}</dd>
                    </div>
                    <div>
                      <dt>Seats</dt>
                      <dd>{selectedTrip.seat_capacity ?? '—'}</dd>
                    </div>
                  </div>
                  <div>
                    <dt>Licence</dt>
                    <dd>{profile?.license_number || '—'}</dd>
                  </div>
                </dl>

                <div className="drv-progress">
                  <div className="drv-progress-head">
                    <span>Route progress</span>
                    <strong>{progressPct}%</strong>
                  </div>
                  <div className="drv-progress-bar">
                    <i style={{ width: `${progressPct}%` }} />
                  </div>
                  <small>Select any amber route dot to inspect stop and timing.</small>
                </div>

                <div className="drv-actions">
                  {!tracking ? (
                    <button type="button" className="drv-btn primary" onClick={startTracking}>
                      Start live GPS
                    </button>
                  ) : (
                    <button type="button" className="drv-btn danger" onClick={stopTracking}>
                      Stop GPS
                    </button>
                  )}
                  {lastGps && (
                    <small className="drv-gps-hint">
                      Last fix {lastGps.lat.toFixed(5)}, {lastGps.lng.toFixed(5)}
                      {lastGps.route_status ? ` · ${lastGps.route_status}` : ''}
                    </small>
                  )}
                </div>
              </>
            ) : (
              /* ---------- Stage 3 sidebar ---------- */
              <>
                <p className="drv-kicker">Route points</p>
                <p className="drv-muted">
                  Point {String(selectedPoint.order).padStart(2, '0')} selected. Choose another dot
                  to inspect.
                </p>
                <ul className="drv-point-list">
                  {routePoints.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={selectedPoint.id === p.id ? 'drv-point active' : 'drv-point'}
                        onClick={() => selectPoint(p)}
                      >
                        <span className="drv-point-num">
                          {String(p.order).padStart(2, '0')}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>{fmtTime(p.scheduled) || '—'}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="drv-btn ghost" onClick={backToTripInfo}>
                  Back to trip info
                </button>
              </>
            )}
          </aside>

          <main className="drv-map-pane">
            <ThembaMap
              polylines={mapOverlays.polylines}
              markers={mapOverlays.markers}
              height="100%"
              fitKey={`${selectedTrip.id}-${selectedPoint?.id || ''}-${lastGps?.at || ''}`}
              onMapClick={() => {}}
              onMarkerClick={(m) => {
                const point = routePoints.find((p) => `rp-${p.id}` === m.id);
                if (point) selectPoint(point);
              }}
            />

            {selectedPoint && (
              <div className="drv-point-card">
                <div className="drv-point-card-head">
                  <span>
                    ROUTE POINT {String(selectedPoint.order).padStart(2, '0')} · SELECTED
                  </span>
                  <button type="button" onClick={backToTripInfo} title="Close">
                    ×
                  </button>
                </div>
                <h3>{selectedPoint.name}</h3>
                <div className="drv-point-grid">
                  <div>
                    <small>Scheduled</small>
                    <strong>{fmtTime(selectedPoint.scheduled) || '—'}</strong>
                  </div>
                  <div>
                    <small>ETA</small>
                    <strong>{fmtTime(selectedPoint.scheduled) || '—'}</strong>
                  </div>
                </div>
                <div className="drv-point-meta">
                  <span>TRIP</span>
                  <strong>{selectedTrip.trip_code}</strong>
                </div>
                {selectedPoint.note && (
                  <div className="drv-point-meta">
                    <span>OPERATIONAL NOTE</span>
                    <strong>{selectedPoint.note}</strong>
                  </div>
                )}
                <div className="drv-point-foot">
                  <span>
                    {plate} · {selectedTrip.seat_capacity ?? '—'} seats
                  </span>
                </div>
              </div>
            )}

           
          </main>
        </div>
      </div>
    );
  }

  /* ================= Stage 1 — Ready for dispatch ================= */
  const unreadCount = (profile?.notifications || []).filter((n) => !n.read).length;

  return (
    <div className="drv-shell">
      <header className="drv-topbar">
        <div className="drv-brand">
          <span className="drv-logo">FL</span>
          <div>
            <strong>FIELDLINE</strong>
            <small>DRIVER CONSOLE</small>
          </div>
        </div>
        <div className="drv-top-meta">
          <span className="drv-live-dot" /> SYSTEM LIVE
          <span className="drv-user-chip">{driverName}</span>
        </div>
      </header>

      <div className="drv-home">
        <div className="drv-home-head">
          <div>
            <p className="drv-kicker">
              SHIFT CONTROL ·{' '}
              {new Date().toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              }).toUpperCase()}
            </p>
            <h1>Ready for dispatch</h1>
            <p className="drv-muted">
              Verify your identity and select an assigned trip to open live routing.
            </p>
          </div>
          <span className="drv-badge">{trips.length} TRIPS ASSIGNED</span>
        </div>

        <div className="drv-cards-row">
          <section className="drv-card">
            <div className="drv-card-head">
              <h3>Driver verification</h3>
              <span className="drv-pill ok">VERIFIED</span>
            </div>
            <div className="drv-kv-grid">
              <div>
                <small>DRIVER</small>
                <strong>{driverName}</strong>
              </div>
              <div>
                <small>DRIVER ID</small>
                <strong>{user?.phone || user?.username || '—'}</strong>
              </div>
              <div>
                <small>LICENCE</small>
                <strong>{profile?.license_number || '—'}</strong>
              </div>
            </div>
          </section>

          <section className="drv-card">
            <div className="drv-card-head">
              <h3>Trip code</h3>
              {matchedCode ? (
                <span className="drv-pill ok">MATCHED</span>
              ) : (
                <span className="drv-pill muted">ENTER CODE</span>
              )}
            </div>
            <label className="drv-label">
              Trip verification code
              <input
                value={tripCodeInput}
                onChange={(e) => setTripCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. TRP-ONG-EMP-01"
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmTrip()}
              />
            </label>
            <button
              type="button"
              className="drv-btn primary"
              onClick={handleConfirmTrip}
              disabled={confirming}
            >
              {confirming ? 'Confirming…' : 'Confirm trip code'}
            </button>
            {matchedCode && (
              <p className="drv-muted" style={{ marginTop: 8 }}>
                Assigned route confirmed for this shift: <strong>{matchedCode}</strong>
              </p>
            )}
          </section>
        </div>

        <div className="drv-split">
          <section className="drv-card drv-trips-card">
            <div className="drv-card-head">
              <h3>My trips</h3>
              <span className="drv-muted">SELECT A ROW TO VIEW ROUTE →</span>
            </div>
            {trips.length === 0 && (
              <p className="drv-muted">
                No trips assigned yet. Enter a trip code above to claim an assigned trip, or wait
                for the operator to assign you.
              </p>
            )}
            <ul className="drv-trip-list">
              {trips.map((t) => {
                const from = t.route?.departure?.name || '—';
                const to = t.route?.destination?.name || '—';
                const plate = t.vehicle_plate || t.vehicle?.plate_number || '—';
                const active = ['boarding', 'in_progress'].includes(t.status);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={active ? 'drv-trip-row active' : 'drv-trip-row'}
                      onClick={() => openTrip(t)}
                    >
                      <span className="drv-trip-time">
                        {fmtTime(t.expected_departure_time)}
                      </span>
                      <span className="drv-trip-body">
                        <strong>
                          {from} → {to}
                        </strong>
                        <small>
                          {t.trip_code} · {plate} · {t.seat_capacity ?? '—'} seats
                        </small>
                      </span>
                      <span className={`drv-pill status-${t.status}`}>
                        {statusLabel(t.status)}
                      </span>
                      <span className="drv-chevron">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="drv-card">
            <div className="drv-card-head">
              <h3>Notifications</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="drv-badge soft">{unreadCount}</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="drv-btn ghost"
                    style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    onClick={markAllNotificationsRead}
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            <ul className="drv-notif-list">
              {(profile?.notifications || []).length === 0 && (
                <li className="drv-muted">No notifications yet.</li>
              )}
              {(profile?.notifications || []).slice(0, 8).map((n) => (
                <li
                  key={n.id}
                  className={n.read ? 'drv-notif read' : 'drv-notif unread'}
                  onClick={() => !n.read && markNotificationRead(n.id)}
                  style={{ cursor: n.read ? 'default' : 'pointer' }}
                >
                  <small>
                    {n.created_at
                      ? new Date(n.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}{' '}
                    · {n.title}
                    {!n.read && <span className="drv-notif-dot" />}
                  </small>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}