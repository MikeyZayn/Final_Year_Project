import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import ThembaMap from '../components/ThembaMap.jsx';
import { Bell, ChevronDown, History, TicketCheck } from '../components/Icons.jsx';
import '../styles/driver.css';

const ACTIVE_STATUSES = ['boarding', 'in_progress'];
const FINISHED_STATUSES = ['completed', 'cancelled'];

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  boarding: 'Boarding',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ACTIVATION_WINDOW_MS = 15 * 60 * 1000;

function tripMoment(trip) {
  if (!trip?.departure_date || !trip?.expected_departure_time) return null;
  const time = trip.expected_departure_time;
  return new Date(`${trip.departure_date}T${time}`);
}

function canActivateLocation(trip, at = new Date()) {
  const start = tripMoment(trip)?.getTime();
  if (!start || FINISHED_STATUSES.includes(trip?.status)) return false;
  // A driver who checked in within the grace period can reconnect during
  // their in-progress journey; this does not grant a late first check-in.
  if (trip.status === 'in_progress' && trip.driver_at_rank_at) return true;
  return at.getTime() >= start - ACTIVATION_WINDOW_MS &&
    at.getTime() <= start + ACTIVATION_WINDOW_MS;
}

function routeLabel(trip) {
  if (!trip) return '—';
  return (
    trip.route?.name ||
    `${trip.route?.departure?.name || 'Rank'} → ${trip.route?.destination?.name || 'Destination'}`
  );
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(value) {
  return value ? value.slice(0, 5) : '—';
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'DR';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export default function DriverPage({ notify }) {
  const [vehicle, setVehicle] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [last, setLast] = useState(null);
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [profile, setProfile] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState('');
  const [panel, setPanel] = useState('mytrip');
  const [now, setNow] = useState(new Date());

  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const latestPos = useRef(null);
  const sharingTripRef = useRef(null);
  const consentRef = useRef(null);
  const autoAttemptedRef = useRef(null);
  const activeTripRef = useRef(null);
  
  const [locationNotice, setLocationNotice] = useState('');
  const [roadGeometry, setRoadGeometry] = useState([]);
  const [routeError, setRouteError] = useState('');

  async function refreshTrips() {
    try {
      const rows = await api.driverTrips();
      setTrips(rows);
      setActiveTrip(previous => {
        // Keep the currently tracked trip selected when its manifest refreshes.
        const sharing = rows.find(t => t.id === sharingTripRef.current);
        if (sharing && !FINISHED_STATUSES.includes(sharing.status)) return sharing;
        // Otherwise prioritise a trip entering its T-15/T+15 GPS window.
        const nowMs = Date.now();
        const due = rows.find(t => {
          const timeMs = tripMoment(t)?.getTime();
          return timeMs && !FINISHED_STATUSES.includes(t.status) &&
            nowMs >= timeMs - ACTIVATION_WINDOW_MS && nowMs <= timeMs + ACTIVATION_WINDOW_MS;
        });
        if (due) return due;
        const current = previous && rows.find(t => t.id === previous.id);
        if (current && !FINISHED_STATUSES.includes(current.status)) return current;
        return rows.find(t => ACTIVE_STATUSES.includes(t.status)) ||
          rows.filter(t => !FINISHED_STATUSES.includes(t.status))
            .sort((a, b) => (tripMoment(a)?.getTime() ?? Infinity) - (tripMoment(b)?.getTime() ?? Infinity))[0] ||
          null;
      });
    } catch (e) { notify?.(e.message || 'Could not refresh trips'); }
  }

  async function refreshAnnouncements() {
    setAnnouncementsLoading(true);
    try {
      const { data } = await api.get('/transport/api/announcements/');
      setAnnouncements(Array.isArray(data) ? data : []);
      setAnnouncementsError('');
    } catch (error) {
      setAnnouncementsError('Could not load announcements. Please try again.');
      notify?.(error.message || 'Could not load announcements');
    } finally {
      setAnnouncementsLoading(false);
    }
  }

  useEffect(() => {
    refreshAnnouncements();
    const pollAnnouncements = setInterval(refreshAnnouncements, 45000);
    const onAnnouncementsFocus = () => refreshAnnouncements();
    window.addEventListener('focus', onAnnouncementsFocus);
    return () => {
      clearInterval(pollAnnouncements);
      window.removeEventListener('focus', onAnnouncementsFocus);
    };
  }, []);

  useEffect(() => {
    api.myVehicle().then(setVehicle).catch(e => notify?.(e.message));
    api.driverProfile().then(setProfile).catch(() => setProfile(null));
    refreshTrips();
    const poll = setInterval(refreshTrips, 15000);
    const onFocus = () => refreshTrips();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);


  const upcomingTrips = useMemo(
    () =>
      trips
        .filter((trip) => !FINISHED_STATUSES.includes(trip.status))
        .sort((a, b) => (tripMoment(a)?.getTime() ?? Infinity) - (tripMoment(b)?.getTime() ?? Infinity)),
    [trips]
  );

  const historyTrips = useMemo(
    () =>
      trips
        .filter(
          (trip) =>
            FINISHED_STATUSES.includes(trip.status)
        )
        .sort((a, b) => (tripMoment(b)?.getTime() ?? 0) - (tripMoment(a)?.getTime() ?? 0)),
    [trips]
  );

  const nextTrip =
    upcomingTrips.find((trip) => ACTIVE_STATUSES.includes(trip.status)) ||
    upcomingTrips.find((trip) => tripMoment(trip) && tripMoment(trip) >= now) ||
    upcomingTrips[0] ||
    null;

  const departureAt = activeTrip ? tripMoment(activeTrip) : null;
  const activationStart = departureAt
    ? new Date(departureAt.getTime() - ACTIVATION_WINDOW_MS)
    : null;
  const activationEnd = departureAt
    ? new Date(departureAt.getTime() + ACTIVATION_WINDOW_MS)
    : null;
  const inActivationWindow = Boolean(
    departureAt && now >= activationStart && now <= activationEnd &&
    !FINISHED_STATUSES.includes(activeTrip?.status)
  );

  const firstName = profile?.user?.first_name || 'driver';
  const fullName =
    [profile?.user?.first_name, profile?.user?.last_name].filter(Boolean).join(' ') || 'Driver';

  function stopTracking(manually = false) {
    if (manually) consentRef.current = activeTripRef.current?.id || null;
    if (watchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    latestPos.current = null;
    sharingTripRef.current = null;
    setTracking(false);
  }

  async function pushOnce(coords, tripId) {
    if ((!vehicle && !activeTripRef.current?.vehicle_id) || !tripId || sharingTripRef.current !== tripId) return;
    try {
      const payload = {
        lat: coords.latitude,
        lng: coords.longitude,
        speed_kmh: coords.speed != null ? coords.speed * 3.6 : null,
        heading_deg: coords.heading ?? 0,
        accuracy_m: coords.accuracy ?? 0,
        source: 'gps',
        trip_id: tripId,
      };
      const res = await api.postLocation(activeTripRef.current?.vehicle_id || vehicle.id, payload);
      if (sharingTripRef.current === tripId) setLast(res);
    } catch (e) {
      setLocationNotice('Location could not be sent. Check connectivity.');
      notify?.(e.message);
    }
  }

  function startTracking(selectedTrip = activeTripRef.current) {
    const trip = selectedTrip;
    if (!trip || FINISHED_STATUSES.includes(trip.status)) {
      setLocationNotice('Choose an assigned, unfinished trip first.');
      return;
    }
    if (!canActivateLocation(trip, new Date())) {
      setLocationNotice('First location activation is available from 15 minutes before until 15 minutes after departure.');
      return;
    }
    const vehicleId = trip.vehicle_id || vehicle?.id;
    if (!vehicleId) {
      setLocationNotice('This trip has no assigned vehicle.');
      return;
    }
    if (!navigator.geolocation) {
      setLocationNotice('Location is unavailable. Use a GPS-enabled device and HTTPS.');
      return;
    }
    if (sharingTripRef.current === trip.id) {
      setPanel('map');
      return;
    }
    if (sharingTripRef.current) stopTracking();
    setLast(null); // Do not display a location from another trip.
    activeTripRef.current = trip;
    setActiveTrip(trip);
    consentRef.current = null;
    const id = trip.id;
    sharingTripRef.current = id;
    setLocationNotice('Waiting for location permission and GPS signal…');
    setTracking(true);
    let routedToMap = false;
    const onPosition = pos => {
      if (sharingTripRef.current !== id) return;
      latestPos.current = pos.coords;
      // Navigate directly to the map screen after the first successful GPS fix.
      // No separate map item is shown in the sidebar.
      if (!routedToMap) {
        routedToMap = true;
        setLast(old => old || { lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPanel('map');
        pushOnce(pos.coords, id); // first position; timer handles later pings
      }
      setLocationNotice('Live location sharing is active.');
    };
    const onError = err => {
      if (sharingTripRef.current !== id) return;
      stopTracking();
      setPanel('mytrip');
      setLocationNotice(err.code === 1
        ? 'Location permission was denied. Enable location access in your browser, then try again.'
        : 'GPS is unavailable. Check device location settings and retry.');
    };
    watchRef.current = navigator.geolocation.watchPosition(onPosition, onError,
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    timerRef.current = setInterval(() => {
      if (latestPos.current) pushOnce(latestPos.current, id);
    }, 7000);
    navigator.geolocation.getCurrentPosition(onPosition, () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  }

  // Automatically share only when the driver has already granted location
  // permission. Otherwise show an opt-in prompt (browsers often require a click).
  useEffect(() => {
    if (!inActivationWindow || !activeTrip || !(vehicle || activeTrip.vehicle_id) || tracking) return;
    if (consentRef.current === activeTrip.id || autoAttemptedRef.current === activeTrip.id) return; // Already tried or driver stopped.
    if (!navigator.permissions?.query) {
      return;
    }
    let cancelled = false;
    navigator.permissions.query({ name: 'geolocation' })
      .then(result => {
        if (cancelled) return;
        if (result.state === 'granted') { autoAttemptedRef.current = activeTrip.id; startTracking(); }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inActivationWindow, activeTrip?.id, vehicle?.id, tracking]);

  useEffect(() => {
    if (tracking && sharingTripRef.current !== activeTrip?.id) stopTracking();
    if (FINISHED_STATUSES.includes(activeTrip?.status) && tracking) stopTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, activeTrip?.status]);

  // ----- Road routing for the dedicated minimal map screen -----
  // When the trip has no stored road geometry, fetch the driving route from
  // the existing Django routing service (ORS -> OSRM fallback).
  const departurePoint = activeTrip?.route?.departure;
  const destinationPoint = activeTrip?.route?.destination;
  useEffect(() => {
    let cancelled = false;
    setRoadGeometry([]);
    setRouteError('');
    if (panel !== 'map' || !activeTrip) return undefined;
    const stored = activeTrip.route?.geometry;
    if (Array.isArray(stored) && stored.length >= 2) {
      setRoadGeometry(stored);
      return undefined;
    }
    const coordinates = [departurePoint?.latitude, departurePoint?.longitude,
      destinationPoint?.latitude, destinationPoint?.longitude];
    if (coordinates.some(value => value == null || value === '' || !Number.isFinite(Number(value)))) {
      setRouteError('The departure or destination has no map coordinates.');
      return undefined;
    }
    api.post('/transport/api/routing/directions/', {
      origin: { lat: Number(departurePoint.latitude), lng: Number(departurePoint.longitude) },
      destination: { lat: Number(destinationPoint.latitude), lng: Number(destinationPoint.longitude) },
    }).then(({ data }) => {
      if (!cancelled) {
        const points = Array.isArray(data.geometry) ? data.geometry : [];
        setRoadGeometry(points);
        if (points.length < 2) setRouteError('The road route is unavailable.');
      }
    }).catch(() => {
      if (!cancelled) setRouteError('Unable to load the road route.');
    });
    return () => { cancelled = true; };
  }, [panel, activeTrip?.id, activeTrip?.route?.geometry, departurePoint?.latitude,
    departurePoint?.longitude, destinationPoint?.latitude, destinationPoint?.longitude]);

  const polylines = roadGeometry.length >= 2
    ? [{ id: 'route', positions: roadGeometry, color: '#18834b', weight: 5 }]
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

  const tools = [
    { id: 'mytrip', label: 'My trips', icon: TicketCheck },
    // Map view is opened automatically after the driver grants GPS permission.
    { id: 'history', label: 'Trip history', icon: History },
    { id: 'announcements', label: 'Announcements', icon: Bell },
  ];

  // Group notices by their target rank, with newest notices first in each group.
  const announcementGroups = useMemo(() => {
    const groups = new Map();
    for (const item of announcements) {
      const name = item.rank_name || 'All ranks';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
    const names = [...groups.keys()].sort((a, b) =>
      a === 'All ranks' ? 1 : b === 'All ranks' ? -1 : a.localeCompare(b)
    );
    return names.map(name => ({ name, items: groups.get(name).sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    ) }));
  }, [announcements]);

  // An assigned trip in progress is most urgent; otherwise show the next departure.
  const urgentTrip = nextTrip;
  const otherTripCount = Math.max(0, upcomingTrips.length - (urgentTrip ? 1 : 0));

  function tripSummary(trip, featured = false) {
    const canShare = canActivateLocation(trip, now);
    const isSharing = tracking && sharingTripRef.current === trip.id;
    return (
      <article key={trip.id} className={`driver-manifest-trip${featured ? ' is-featured' : ''}`}>
        <div className="driver-trip-time">
          <strong>{timeLabel(trip.expected_departure_time)}</strong>
          <small>{dateLabel(trip.departure_date)}</small>
        </div>
        <div className="driver-trip-info">
          <strong>{routeLabel(trip)}</strong>
          <span className="muted">{trip.route?.departure?.name || 'Departure rank'} · {trip.route?.destination?.name || 'Destination'}</span>
          <span className="muted">{trip.vehicle_plate || 'Vehicle pending'} · {trip.seats_taken ?? 0}/{trip.seat_capacity ?? '—'} seats · {trip.trip_code || 'Trip'}</span>
        </div>
        <div className="driver-trip-actions">
          <span className={`driver-status-pill status-${trip.status}`}>{STATUS_LABELS[trip.status] || trip.status}</span>
          <button
            type="button"
            className="driver-location-action"
            disabled={!canShare && !isSharing}
            title={!canShare && !isSharing ? 'Available from 15 minutes before until 15 minutes after departure' : undefined}
            onClick={() => isSharing ? (setActiveTrip(trip), setPanel('map')) : startTracking(trip)}
          >
            {isSharing ? 'View live map' : 'Activate location'}
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="driver-portal">
      <aside className="driver-side" aria-label="Driver sections">
        <div className="driver-side-title">THEMBA · DRIVER PORTAL</div>
        <nav className="driver-nav" aria-label="Driver navigation">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`driver-nav-button${panel === id ? ' active' : ''}`} onClick={() => setPanel(id)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <button type="button" className={`driver-side-profile${panel === 'profile' ? ' active' : ''}`}
          aria-label={`Open ${fullName} profile`} onClick={() => setPanel('profile')}>
          <span className="driver-avatar">{initials(fullName)}</span>
          <span className="driver-side-profile-text">
            <strong>{fullName}</strong>
            <small>Driver · Profile</small>
          </span>
          <ChevronDown size={16} className="driver-side-caret" />
        </button>
      </aside>

      <main className="driver-main">
        {panel !== 'map' && <header className="driver-head">
          <span className="driver-eyebrow">DRIVER DASHBOARD</span>
          <h1>{panel === 'profile' ? 'My profile' : `Sawubona, ${firstName}`}</h1>
          {panel === 'mytrip' && <p className="muted">Assigned trip manifest. Trips start automatically at departure after operator checks.</p>}
          {panel === 'announcements' && <p className="muted">Updates from administrators and operators at your assigned rank.</p>}
        </header>}

        {panel === 'mytrip' && (
          <div className="driver-panel">
            <section className="driver-card driver-manifest" aria-label="Driver assigned trip manifest">
              <div className="driver-manifest-heading">
                <div>
                  <span className="driver-eyebrow">MOST URGENT TRIP</span>
                  <h2>My trips</h2>
                </div>
                <span className="driver-manifest-count">{upcomingTrips.length} active / upcoming</span>
              </div>
              {urgentTrip ? tripSummary(urgentTrip, true) : (
                <p className="muted">No active or upcoming trips assigned. Your operator will assign a trip when available.</p>
              )}
              {urgentTrip?.status === 'scheduled' && tripMoment(urgentTrip) <= now && (
                <p className="driver-location-note" role="status">
                  This departure is waiting for operator engagement and driver/vehicle verification before automatic start.
                </p>
              )}
              {locationNotice && <p className="driver-location-note" role="status">{locationNotice}</p>}
              <details className="driver-all-trips" key={`manifest-${urgentTrip?.id || 'none'}`}>
                <summary>
                  <TicketCheck size={19} />
                  <span><strong>All assigned trips</strong><small>{upcomingTrips.length} active and upcoming · {otherTripCount} besides the priority trip</small></span>
                  <ChevronDown size={18} className="driver-expand-chevron" />
                </summary>
                <div className="driver-manifest-list">
                  {upcomingTrips.length
                    ? upcomingTrips.map(t => tripSummary(t))
                    : <p className="muted">No assigned trips to show.</p>}
                </div>
              </details>
              <p className="driver-privacy-note">Location permission is requested between 15 minutes before and 15 minutes after departure. If the driver has not checked in within 350 m of departure rank A by 15 minutes after departure, paid passengers are recorded as fully refunded. The driver must grant browser location access unless permission was already given.</p>
            </section>
          </div>
        )}

        {panel === 'map' && (
          <section className="driver-card driver-map-panel driver-map-minimal" aria-label="Live trip route">
            <div className="driver-map-controls">
              <button type="button" className="driver-back-action" onClick={() => setPanel('mytrip')}>
                Back to my trips
              </button>
              {tracking && <button type="button" className="driver-stop-action" onClick={() => {
                stopTracking(true);
                setPanel('mytrip');
              }}>Stop location</button>}
            </div>
            {activeTrip ? <ThembaMap minimal markers={markers} polylines={polylines}
              height="min(72vh, 650px)" fitKey={`route-${activeTrip.id}-${roadGeometry.length}`} />
              : <p className="muted">Select a trip in My Trips to view its route.</p>}
            {routeError && <p className="driver-map-error" role="status">{routeError}</p>}
          </section>
        )}

        {panel === 'history' && (
          <section className="driver-card">
            <h2>Trip history</h2>
            <p className="muted">Finished trips assigned to you.</p>
            {historyTrips.length === 0 ? <p className="muted">No past trips yet.</p> : (
              <div className="driver-history-scroll">
                <table className="driver-history">
                  <thead><tr><th>Date</th><th>Time</th><th>Route</th><th>Status</th><th>Passengers</th></tr></thead>
                  <tbody>{historyTrips.map(trip => (
                    <tr key={trip.id}>
                      <td>{dateLabel(trip.departure_date)}</td>
                      <td>{timeLabel(trip.expected_departure_time)}</td>
                      <td>{routeLabel(trip)}</td>
                      <td>{STATUS_LABELS[trip.status] || trip.status}</td>
                      <td>{trip.seats_taken ?? 0}/{trip.seat_capacity ?? '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {panel === 'announcements' && (
          <section className="driver-card driver-announcements-panel" aria-label="Rank announcements">
            <div className="driver-announcements-heading">
              <div><span className="driver-eyebrow">RANK UPDATES</span><h2>Announcements</h2></div>
              <button className="driver-refresh-announcements" onClick={refreshAnnouncements}
                type="button" disabled={announcementsLoading}>
                {announcementsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {announcementsError && <p className="driver-announcements-error" role="alert">{announcementsError}</p>}
            {!announcementsLoading && announcements.length === 0 && (
              <p className="muted">No active announcements for your assigned rank. Notices for other ranks are hidden.</p>
            )}
            {announcementGroups.map(group => (
              <div className="driver-announcements-group" key={group.name}>
                <h3>{group.name}</h3>
                <div className="driver-announcements-list">
                  {group.items.map(a => (
                    <article className="driver-announcement" key={a.id}>
                      <div className="driver-announcement-meta">
                        <span className="driver-announcement-author">{a.source_name || a.operator_name || 'THEMBA'}</span>
                        <time dateTime={a.created_at}>{a.created_at ? new Date(a.created_at).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' }) : ''}</time>
                      </div>
                      <h4>{a.title}</h4>
                      <p>{a.body}</p>
                      {a.route_label && <small>Route: {a.route_label}</small>}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {panel === 'profile' && (
          <section className="driver-card driver-profile-panel">
            <h2>{fullName}</h2>
            {profile ? (
              <>
                <p><strong>Phone:</strong> {profile.user?.phone || '—'}</p>
                <p><strong>Licence:</strong> {profile.license_number || '—'} · <strong>Status:</strong> {profile.status || '—'}</p>
                <p><strong>Rating:</strong> {profile.rating_avg != null ? `${profile.rating_avg} / 5` : 'No ratings yet'}{profile.rating_count ? ` (${profile.rating_count} ratings)` : ''}</p>
                {vehicle && <p><strong>Vehicle:</strong> {vehicle.plate_number} · {vehicle.make} {vehicle.model}</p>}
              </>
            ) : <p className="muted">Loading profile…</p>}
          </section>
        )}
      </main>
    </div>
  );
}
