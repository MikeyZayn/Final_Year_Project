/**
 * Passenger hub UI — 3 stages: Desk → Route → Active.
 * - Desk: search trips, local fares, verify code, My bookings
 * - Route: route preview on map (distance/time/fare)
 * - Active: verified trip — live vehicle map + info + panic
 *
 * search-first: GPS → chosen departure (dashed blue)
 *               chosen departure → destination (amber solid)
 */
import { useEffect, useMemo, useState } from 'react';
import { api, getUser } from '../api';
import { computeRoute } from '../services/routingApi';
import ThembaMap, {
  overlaysFromTrip,
  polylineFromDirections,
} from '../components/ThembaMap.jsx';
import {
  FARE_ROWS,
  PREDETERMINED_PLACES,
  lookupLocalFare,
  nearestRank,
} from '../data/localFares';
import { useGeolocation } from '../hooks/useGeolocation';
import '../styles/passengerMapDashboard.css';

const PLACES = PREDETERMINED_PLACES;

function placeByName(name) {
  return PLACES.find((p) => p.name === name) || null;
}

function mapApiTrip(t) {
  const origin = t.route?.departure?.name || '—';
  const destination = t.route?.destination?.name || '—';
  const fareNum = t.route?.fare != null ? Number(t.route.fare) : null;
  return {
    id: t.id,
    trip_code: t.trip_code,
    origin,
    destination,
    departure: [t.departure_date, t.expected_departure_time || '']
      .filter(Boolean)
      .join(' '),
    status: t.status,
    operator: t.operator_name || t.route?.operator_name || 'Taxi association',
    driver: t.driver_name || 'To be assigned',
    driver_phone: t.driver_phone || '',
    vehicle: t.vehicle_label || t.vehicle_plate || '—',
    registration: t.vehicle_plate || '—',
    fare: fareNum != null ? `R${fareNum}` : '—',
    fareNum,
    seats_available: t.seats_available,
    raw: t,
  };
}

export default function PassengerMapDashboard({ notify, onExit }) {
  const user = getUser();
  const passengerName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'Passenger';

  const geo = useGeolocation();
  const [departure, setDeparture] = useState('Ongoye');
  const [destination, setDestination] = useState('Empangeni');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [nearestHint, setNearestHint] = useState(null);
  const [panicOpen, setPanicOpen] = useState(false);
  const [booked, setBooked] = useState(null);
  const [myBookings, setMyBookings] = useState([]);
  const [adhocLine, setAdhocLine] = useState(null);
  const [toRankGeometry, setToRankGeometry] = useState([]);
  const [taxiGeometry, setTaxiGeometry] = useState([]);
  const [routing, setRouting] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifiedTrip, setVerifiedTrip] = useState(null);
  const [liveTrip, setLiveTrip] = useState(null);
  const [liveError, setLiveError] = useState('');
  // desk | route | active
  const [viewMode, setViewMode] = useState('desk');

  const initials = useMemo(
    () =>
      passengerName
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    [passengerName]
  );

  const depPlace = placeByName(departure);
  const destPlace = placeByName(destination);
  const localFare = lookupLocalFare(departure, destination);

  useEffect(() => {
    geo.requestOnce?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!geo.position) return;
    const nearest = nearestRank(geo.position.lat, geo.position.lng);
    if (!nearest) return;
    setNearestHint(nearest);
    setDeparture(nearest.name);
  }, [geo.position]);

  useEffect(() => {
    api
      .myBookings()
      .then(setMyBookings)
      .catch(() => {});
  }, [booked]);

  // Poll live trip after verification
  useEffect(() => {
    const tripId = liveTrip?.id || selected?.raw?.id;
    if (!verifiedTrip || !tripId) return undefined;
    const tick = () => loadLiveForTrip(tripId);
    tick();
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifiedTrip, selected?.raw?.id, liveTrip?.id]);

  async function searchTrip() {
    if (departure === destination) {
      notify?.('Departure and destination must be different.');
      setResults([]);
      return;
    }
    setLoading(true);
    setBooked(null);
    setSelected(null);
    setAdhocLine(null);
    try {
      const trips = await api.listTrips({ from: departure, to: destination });
      let matched = (trips || []).map(mapApiTrip);

      if (!matched.length && localFare != null) {
        matched = [
          {
            id: null,
            trip_code: '—',
            origin: departure,
            destination,
            departure: 'Check rank for next departure',
            status: 'info',
            operator: `${departure} Taxi Association`,
            driver: '—',
            vehicle: '—',
            registration: '—',
            fare: `R${localFare}`,
            fareNum: localFare,
            seats_available: null,
            raw: null,
            isInfoOnly: true,
          },
        ];
        notify?.(
          'No live trips on API for that pair yet — showing official local fare.'
        );
      } else if (!matched.length) {
        notify?.('No trips found for that route.');
      }

      setResults(matched);
      if (matched.length && matched[0].raw) setSelected(matched[0]);
    } catch (e) {
      notify?.(e.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmBooking() {
    if (!selected?.raw?.id) {
      notify?.('Select a live trip (not the fare-only row) to book.');
      return;
    }
    setBooking(true);
    try {
      const b = await api.createBooking(selected.raw.id);
      const code = b.verification_code || null;
      setBooked({
        booking_id: b.id,
        verification_code: code,
        trip_code: b.trip_code || selected.trip_code,
        trip_id: b.trip || selected.raw?.id,
        status: b.status,
      });
      if (code) {
        setVerifyInput(code);
        notify?.(
          `Booked ${selected.trip_code}. Verification code: ${code} — show at boarding.`
        );
      } else {
        notify?.(`Booking #${b.id} confirmed for ${selected.trip_code}.`);
      }
    } catch (e) {
      notify?.(e.message);
    } finally {
      setBooking(false);
    }
  }

  async function previewRoadRoute() {
    if (!depPlace || !destPlace) {
      notify?.('Select valid departure and destination.');
      return;
    }
    if (departure === destination) {
      notify?.('Departure and destination must be different.');
      return;
    }

    setRouting(true);
    setTaxiGeometry([]);
    setToRankGeometry([]);
    setAdhocLine(null);

    try {
      const gps = geo.position
        ? { lat: geo.position.lat, lng: geo.position.lng }
        : null;

      const rank = { lat: depPlace.lat, lng: depPlace.lng, name: depPlace.name };

      if (gps) {
        const nearest = nearestRank(gps.lat, gps.lng);
        const dist = Math.hypot(gps.lat - rank.lat, gps.lng - rank.lng);
        if (dist > 0.0015) {
          const leg1 = await computeRoute(gps, rank);
          setToRankGeometry(leg1.geometry || []);
          if (nearest && nearest.name !== rank.name) {
            notify?.(
              `Routing via ${rank.name}. Nearest rank to you is ${nearest.name} (${nearest.distanceKm} km).`
            );
          }
        }
      } else {
        geo.requestOnce?.();
        notify?.('Enable GPS for the path from your location to the departure rank.');
      }

      const leg2 = await computeRoute(rank, destPlace);
      setTaxiGeometry(leg2.geometry || []);
      const line = polylineFromDirections({
        geometry: leg2.geometry,
        distance_km: leg2.distanceKm,
        duration_min: leg2.durationMin,
        source: leg2.source,
        fare: leg2.fare,
      });
      if (line) {
        line.distanceKm = leg2.distanceKm;
        line.durationMin = leg2.durationMin;
      }
      setAdhocLine(line);

      notify?.(
        `Route: your location → ${rank.name} → ${destPlace.name} (${leg2.source || 'ORS/OSRM'}) · ${Number(leg2.distanceKm).toFixed(1)} km`
      );
      setViewMode('route');
    } catch (err) {
      notify?.(err.message || 'Routing failed. Check ORS_API_KEY and backend.');
    } finally {
      setRouting(false);
    }
  }

  async function loadLiveForTrip(tripId) {
    if (!tripId) return;
    setLiveError('');
    try {
      const data = await api.tripLive(tripId);
      setLiveTrip(data);
    } catch (e) {
      setLiveError(e.message);
      setLiveTrip(null);
    }
  }

  async function confirmVerifyCode() {
    const cleaned = verifyInput.trim();
    if (!cleaned) {
      notify?.('Enter the verification code from your booking.');
      return;
    }

    let matchedBooking = null;
    let tripId = selected?.raw?.id || null;

    if (booked?.verification_code && cleaned === booked.verification_code) {
      matchedBooking = booked;
      tripId = selected?.raw?.id || booked.trip_id || tripId;
    } else {
      const fromMine = myBookings.find(
        (b) =>
          String(b.verification_code || '').toLowerCase() === cleaned.toLowerCase() ||
          String(b.trip_code || '').toLowerCase() === cleaned.toLowerCase()
      );
      if (fromMine) {
        matchedBooking = {
          booking_id: fromMine.id,
          verification_code: fromMine.verification_code || cleaned,
          trip_code: fromMine.trip_code,
          status: fromMine.status,
        };
        tripId = fromMine.trip || fromMine.trip_id || tripId;
      }
    }

    if (!matchedBooking) {
      notify?.('Code not found on your bookings.');
      return;
    }

    setVerifiedTrip({
      ...(selected || {}),
      verification_code: matchedBooking.verification_code || cleaned,
      booking_id: matchedBooking.booking_id,
      trip_code: matchedBooking.trip_code || selected?.trip_code,
      status: matchedBooking.status,
    });
    setViewMode('active');

    if (tripId) {
      await loadLiveForTrip(tripId);
      notify?.('Code confirmed — showing trip details and live vehicle location.');
    } else {
      notify?.('Code recognised, but trip id is missing.');
    }
  }

  async function sendPanic() {
    const ok = window.confirm(
      'Send emergency alert to the operator/administrator with your trip and location?\n\nThis is not a substitute for calling emergency services.'
    );
    if (!ok) return;
    setPanicOpen(false);
    try {
      const pos = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p.coords),
          () => resolve(null),
          { timeout: 8000 }
        );
      });
      await api.panic({
        tripId: selected?.raw?.id || booked?.booking_id,
        type: 'PANIC_ALERT',
        departurePoint: departure,
        destination,
        latitude: pos?.latitude,
        longitude: pos?.longitude,
        accuracy: pos?.accuracy,
      });
      notify?.('Emergency alert sent to operators.');
    } catch (e) {
      notify?.(e.message);
    }
  }

  const mapOverlays = useMemo(() => {
    const tripSrc = liveTrip || selected?.raw;
    const base = tripSrc ? overlaysFromTrip(tripSrc) : { polylines: [], markers: [] };
    const lines = [...base.polylines];
    const markers = [...base.markers];

    if (toRankGeometry.length > 2) {
      lines.push({
        id: 'to-rank',
        positions: toRankGeometry,
        color: '#38bdf8',
        weight: 4,
        dashed: true,
      });
    }
    if (taxiGeometry.length > 2) {
      lines.push({
        id: 'taxi-corridor',
        positions: taxiGeometry,
        color: '#f5a524',
        weight: 5,
      });
    } else if (adhocLine) {
      lines.push(adhocLine);
    }

    if (depPlace) {
      markers.push({
        id: 'dep',
        lat: depPlace.lat,
        lng: depPlace.lng,
        label: `Departure: ${depPlace.name}`,
        kind: 'rank',
      });
    }
    if (destPlace) {
      markers.push({
        id: 'dest',
        lat: destPlace.lat,
        lng: destPlace.lng,
        label: `Destination: ${destPlace.name}`,
        kind: 'dest',
      });
    }
    if (nearestHint) {
      markers.push({
        id: 'nearest',
        lat: nearestHint.lat,
        lng: nearestHint.lng,
        label: `Nearest rank: ${nearestHint.name}`,
        kind: 'rank',
      });
    }
    if (geo.position) {
      markers.push({
        id: 'you',
        lat: geo.position.lat,
        lng: geo.position.lng,
        label: 'You',
        kind: 'you',
        color: '#38bdf8',
      });
    }
    const live = liveTrip?.live_location;
    if (live && live.lat != null && live.lng != null) {
      markers.push({
        id: 'vehicle-live',
        lat: Number(live.lat),
        lng: Number(live.lng),
        label: liveTrip?.vehicle_plate || 'Taxi',
        kind: 'vehicle',
        color: '#22c55e',
      });
    }
    return { polylines: lines, markers };
  }, [
    selected,
    adhocLine,
    toRankGeometry,
    taxiGeometry,
    depPlace,
    destPlace,
    nearestHint,
    geo.position,
    liveTrip,
  ]);

  const brandHeader = (
    <header className="pmd-topbar">
      <div className="pmd-brand-row">
        <span className="pmd-mark">T</span>
        <div>
          <strong>TRANSIT // PASS</strong>
          <small>PASSENGER OPERATIONS PORTAL</small>
        </div>
      </div>
      <div className="pmd-user-chip">
        <span className="pmd-live-dot" /> IDENTITY VERIFIED
        <strong>{passengerName}</strong>
        <span className="pmd-avatar-sm">{initials}</span>
      </div>
    </header>
  );

  /* ========== Stage: Active trip ========== */
  if (viewMode === 'active' && verifiedTrip) {
    const vt = verifiedTrip;
    return (
      <div className="pmd pmd-stage-active">
        {brandHeader}
        <div className="pmd-active-wrap">
          <div className="pmd-active-head">
            <button type="button" className="pmd-btn ghost" onClick={() => setViewMode('desk')}>
              ← Desk
            </button>
            <div>
              <p className="pmd-kicker">
                ACTIVE TRIP{vt.trip_code ? ` / ${vt.trip_code}` : ''}
              </p>
              <h1>
                {vt.origin || departure} → {vt.destination || destination}
              </h1>
              <p className="pmd-hint">Trip verified. Review vehicle and live location.</p>
            </div>
            <span className="pmd-pill ok">VERIFIED · READY</span>
          </div>

          <div className="pmd-active-grid">
            <div className="pmd-map-panel">
              <div className="pmd-map-badge">
                <span className="pmd-live-dot" /> LIVE ROUTE
                {liveTrip?.live_location ? ' · GPS CONNECTED' : ''}
              </div>
              <ThembaMap
                polylines={mapOverlays.polylines}
                markers={mapOverlays.markers}
                height="420px"
                fitKey={`active-${vt.trip_code}-${liveTrip?.live_location?.lat || ''}`}
              />
              <div className="pmd-map-legend">
                <span>● {departure}</span>
                <span>— {destination}</span>
              </div>
              <div className="pmd-trip-control">
                <small>TRIP CONTROL</small>
                <p>
                  {liveTrip?.vehicle_plate
                    ? `Vehicle ${liveTrip.vehicle_plate}`
                    : vt.vehicle && vt.vehicle !== '—'
                      ? `Vehicle ${vt.vehicle} ${vt.registration || ''}`.trim()
                      : 'Awaiting vehicle GPS'}
                  {liveTrip?.live_location ? ' · live position on map' : ' · waiting for driver GPS'}
                </p>
                {liveError && <p className="pmd-error">{liveError}</p>}
              </div>
            </div>

            <div className="pmd-active-side">
              <section className="pmd-card">
                <div className="pmd-card-head">
                  <h3>Trip information</h3>
                  <span className="pmd-pill ok">CONFIRMED</span>
                </div>
                <dl className="pmd-dl">
                  <div>
                    <dt>Fare</dt>
                    <dd>{vt.fare || (localFare != null ? `R${localFare}` : '—')}</dd>
                  </div>
                  <div>
                    <dt>Departure</dt>
                    <dd>{vt.departure || '—'}</dd>
                  </div>
                  <div>
                    <dt>Route</dt>
                    <dd>
                      {vt.origin || departure} → {vt.destination || destination}
                    </dd>
                  </div>
                  <div>
                    <dt>Vehicle</dt>
                    <dd>
                      {vt.vehicle || '—'} {vt.registration || ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Driver</dt>
                    <dd>{vt.driver || '—'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{vt.status || 'verified'}</dd>
                  </div>
                  <div>
                    <dt>Code</dt>
                    <dd>{vt.verification_code || verifyInput || '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="pmd-card">
                <div className="pmd-card-head">
                  <h3>Safety area</h3>
                  <span className="pmd-pill muted">MONITORING ON</span>
                </div>
                <p className="pmd-hint">Emergency assistance available 24/7</p>
                <button
                  type="button"
                  className="pmd-btn danger block"
                  onClick={() => setPanicOpen(true)}
                >
                  PANIC / GET HELP
                </button>
              </section>
            </div>
          </div>
        </div>

        {panicOpen && (
          <div className="pmd-modal-backdrop" role="presentation">
            <div className="pmd-modal" role="dialog">
              <h3>Emergency alert</h3>
              <p>
                This notifies the operator/administrator with your trip and location. It does not
                replace calling emergency services.
              </p>
              <div className="pmd-modal-actions">
                <button type="button" className="pmd-btn ghost" onClick={() => setPanicOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="pmd-btn danger" onClick={sendPanic}>
                  Send alert
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ========== Stage: Route preview ========== */
  if (viewMode === 'route') {
    return (
      <div className="pmd pmd-stage-route">
        {brandHeader}
        <div className="pmd-route-wrap">
          <div className="pmd-active-head">
            <button type="button" className="pmd-btn ghost" onClick={() => setViewMode('desk')}>
              ← Return to search
            </button>
            <div>
              <p className="pmd-kicker">ROUTE SEARCH / RESULT</p>
              <h1>
                {departure} → {destination}
              </h1>
              <p className="pmd-hint">
                Recommended passenger route (road geometry from routing service).
              </p>
            </div>
            <span className="pmd-pill ok">ROUTE AVAILABLE</span>
          </div>

          <div className="pmd-active-grid">
            <div className="pmd-map-panel">
              <div className="pmd-map-badge">ROUTE PREVIEW</div>
              <ThembaMap
                polylines={mapOverlays.polylines}
                markers={mapOverlays.markers}
                height="420px"
                fitKey={`route-${departure}-${destination}-${taxiGeometry.length}`}
              />
              <div className="pmd-map-legend">
                <span>● {departure}</span>
                <span>— {destination}</span>
              </div>
              <div className="pmd-stat-row">
                <div className="pmd-stat">
                  <small>ESTIMATED DISTANCE</small>
                  <strong>
                    {adhocLine?.distanceKm != null
                      ? `${Number(adhocLine.distanceKm).toFixed(1)} km`
                      : taxiGeometry.length
                        ? 'See path'
                        : '—'}
                  </strong>
                </div>
                <div className="pmd-stat">
                  <small>ESTIMATED TIME</small>
                  <strong>
                    {adhocLine?.durationMin != null
                      ? `${Math.round(adhocLine.durationMin)} min`
                      : '—'}
                  </strong>
                </div>
                <div className="pmd-stat">
                  <small>OFFICIAL FARE</small>
                  <strong>{localFare != null ? `R${localFare}` : '—'}</strong>
                </div>
              </div>
            </div>

            <div className="pmd-active-side">
              <section className="pmd-card">
                <h3>Route summary</h3>
                <dl className="pmd-dl">
                  <div>
                    <dt>Departure</dt>
                    <dd>{departure}</dd>
                  </div>
                  <div>
                    <dt>Destination</dt>
                    <dd>{destination}</dd>
                  </div>
                  <div>
                    <dt>Legs</dt>
                    <dd>
                      {toRankGeometry.length > 2
                        ? 'You → rank → destination'
                        : 'Rank → destination'}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="pmd-card fare-card">
                <small>OFFICIAL FARE</small>
                <strong className="pmd-fare-lg">
                  {localFare != null ? `R${localFare}` : '—'}
                </strong>
                <span className="pmd-pill muted">FIXED FARE</span>
              </section>
              <button
                type="button"
                className="pmd-btn primary block"
                onClick={() => {
                  setViewMode('desk');
                  searchTrip();
                }}
                disabled={loading}
              >
                → Continue to trip search
              </button>
              <button
                type="button"
                className="pmd-btn ghost block"
                onClick={() => setViewMode('desk')}
              >
                ← Return to search
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ========== Stage: Desk ========== */
  return (
    <div className="pmd pmd-stage-desk">
      {brandHeader}
      <div className="pmd-desk">
        <div className="pmd-desk-head">
          <div>
            <p className="pmd-kicker">PASSENGER DESK / DISCOVERY</p>
            <h1>Find and verify your trip</h1>
            <p className="pmd-hint">
              Search official routes, confirm the fare, then verify your booking code.
            </p>
          </div>
          {onExit && (
            <button type="button" className="pmd-btn ghost" onClick={onExit}>
              Sign out
            </button>
          )}
        </div>

        <div className="pmd-desk-grid">
          <section className="pmd-card">
            <h3>Search trip</h3>
            <p className="pmd-hint">
              Enter your planned journey to check the official passenger fare.
            </p>
            {nearestHint && (
              <div className="pmd-nearest">
                <span>Nearest rank (GPS)</span>
                <strong>
                  {nearestHint.name} · {nearestHint.distanceKm} km
                </strong>
              </div>
            )}
            <label className="pmd-label">
              Departure
              <select value={departure} onChange={(e) => setDeparture(e.target.value)}>
                {PLACES.map((pl) => (
                  <option key={pl.id} value={pl.name}>
                    {pl.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pmd-label">
              Destination
              <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                {PLACES.map((pl) => (
                  <option key={pl.id} value={pl.name}>
                    {pl.name}
                  </option>
                ))}
              </select>
            </label>
            {localFare != null && (
              <div className="pmd-fare-banner">
                <span>OFFICIAL TRIP FARE · One passenger</span>
                <strong>R{localFare}</strong>
              </div>
            )}
            <div className="pmd-btn-row">
              <button
                type="button"
                className="pmd-btn primary"
                onClick={searchTrip}
                disabled={loading}
              >
                {loading ? 'Searching…' : 'Search trip'}
              </button>
              <button
                type="button"
                className="pmd-btn ghost"
                onClick={previewRoadRoute}
                disabled={routing}
              >
                {routing ? 'Routing…' : 'Search route'}
              </button>
            </div>

            {results.length > 0 && (
              <div className="pmd-desk-results">
                <div className="pmd-results-head">
                  <span>Matching trips</span>
                  <span>{results.length}</span>
                </div>
                {results.map((trip) => (
                  <button
                    key={trip.id ?? `${trip.origin}-${trip.destination}-${trip.trip_code}`}
                    type="button"
                    className={
                      selected &&
                      ((trip.id != null && selected.id === trip.id) ||
                        (trip.isInfoOnly &&
                          selected.isInfoOnly &&
                          selected.origin === trip.origin))
                        ? 'pmd-trip active'
                        : 'pmd-trip'
                    }
                    onClick={() => setSelected(trip)}
                  >
                    <strong>
                      {trip.origin} → {trip.destination}
                    </strong>
                    <small>
                      {trip.operator} · {trip.trip_code}
                    </small>
                    <div className="pmd-trip-meta">
                      <span>{trip.departure}</span>
                      <span className="pmd-status">{trip.status}</span>
                    </div>
                  </button>
                ))}
                {selected && !selected.isInfoOnly && (
                  <>
                    <div className="pmd-fare-block">
                      <span>OFFICIAL FARE</span>
                      <strong>{selected.fare}</strong>
                    </div>
                    {!booked ? (
                      <button
                        type="button"
                        className="pmd-btn primary block"
                        onClick={confirmBooking}
                        disabled={booking}
                      >
                        {booking ? 'Booking…' : 'Confirm booking'}
                      </button>
                    ) : (
                      <div className="pmd-code-banner">
                        Booked · code <strong>{booked.verification_code || '—'}</strong>
                        <small>Enter this code under Verify a booked trip</small>
                      </div>
                    )}
                  </>
                )}
                {selected && selected.isInfoOnly && (
                  <div className="pmd-fare-block">
                    <span>LOCAL FARE (no live trip yet)</span>
                    <strong>{selected.fare}</strong>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="pmd-card">
            <h3>Verify a booked trip</h3>
            <p className="pmd-hint">Use the verification code from your booking confirmation.</p>
            <label className="pmd-label">
              Trip verification code
              <input
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value.toUpperCase())}
                placeholder="e.g. code from booking"
                onKeyDown={(e) => e.key === 'Enter' && confirmVerifyCode()}
              />
            </label>
            <button type="button" className="pmd-btn primary block" onClick={confirmVerifyCode}>
              Verify trip
            </button>
            <p className="pmd-hint">
              Verification unlocks journey details, live map, and safety controls.
            </p>
          </section>
        </div>

        {myBookings.length > 0 && (
          <section className="pmd-card pmd-bookings">
            <h3>My bookings</h3>
            <ul className="pmd-booking-list">
              {myBookings.map((b) => (
                <li key={b.id}>
                  <strong>{b.trip_code || b.id}</strong>
                  <span>
                    {b.status}
                    {b.verification_code ? ` · ${b.verification_code}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {panicOpen && (
        <div className="pmd-modal-backdrop" role="presentation">
          <div className="pmd-modal" role="dialog">
            <h3>Emergency alert</h3>
            <p>
              This notifies the operator/administrator with your trip and location. It does not
              replace calling emergency services.
            </p>
            <div className="pmd-modal-actions">
              <button type="button" className="pmd-btn ghost" onClick={() => setPanicOpen(false)}>
                Cancel
              </button>
              <button type="button" className="pmd-btn danger" onClick={sendPanic}>
                Send alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}