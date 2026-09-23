/**
 * Restored passenger hub UI (search-first layout) wired to merged API.
 *
 * SRS alignment:
 * - Search Trip / Fare / Route (predetermined ranks + API trips)
 * - Confirm booking → POST /api/bookings/ → single-use verification code
 * - Show verification code for boarding + future trip-verified feedback
 * - View driver/vehicle on selected trip
 * - Panic alert with trip + location
 * - Google Maps for display; ORS/OSRM via backend for road geometry
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
    vehicle: t.vehicle_label || t.vehicle_plate || '—',
    registration: t.vehicle_plate || '—',
    fare: fareNum != null ? `R${fareNum}` : '—',
    fareNum,
    seats_available: t.seats_available,
    raw: t,
  };
}

export default function PassengerMapDashboard({ notify }) {
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
  const [booked, setBooked] = useState(null); // { booking_id, verification_code, trip_code }
  const [myBookings, setMyBookings] = useState([]);
  const [adhocLine, setAdhocLine] = useState(null);
  const [routing, setRouting] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifiedTrip, setVerifiedTrip] = useState(null);

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

      // Fallback: show local fare info even if no live trip seeded
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
          'No live trips on API for that pair yet — showing official local fare. Ask operator or wait for seeded trips.'
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
        status: b.status,
      });
      if (code) {
        setVerifyInput(code);
        notify?.(
          `Booked ${selected.trip_code}. Verification code: ${code} — show at boarding (SRS).`
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
      notify?.('Choose departure and destination ranks first.');
      return;
    }
    setRouting(true);
    try {
      // Original search-first path: computeRoute → POST /api/routing/directions/
      const data = await computeRoute(
        { lat: depPlace.lat, lng: depPlace.lng },
        { lat: destPlace.lat, lng: destPlace.lng }
      );
      setAdhocLine(
        polylineFromDirections({
          geometry: data.geometry,
          distance_km: data.distanceKm,
          duration_min: data.durationMin,
          source: data.source,
          fare: data.fare,
        })
      );
      notify?.(
        `Road route ${data.distanceKm} km · ~${data.durationMin} min (${data.source})` +
          (data.fare != null
            ? ` · est. R${data.fare}`
            : localFare != null
              ? ` · local R${localFare}`
              : '')
      );
    } catch (e) {
      notify?.(e.message);
    } finally {
      setRouting(false);
    }
  }

  function confirmVerifyCode() {
    const cleaned = verifyInput.trim();
    if (!cleaned) {
      notify?.('Enter the verification code from your booking.');
      return;
    }
    // SRS: code is single-use, linked to booking/trip — passenger holds it for boarding + feedback
    if (booked?.verification_code && cleaned === booked.verification_code) {
      setVerifiedTrip({
        ...selected,
        verification_code: cleaned,
        booking_id: booked.booking_id,
      });
      notify?.(
        'Code recognised for this booking. Present it to the operator at boarding. After the trip completes, the same verified link enables feedback (SRS central contribution).'
      );
      return;
    }
    const fromMine = myBookings.find(
      (b) =>
        String(b.verification_code || '').toLowerCase() === cleaned.toLowerCase() ||
        String(b.trip_code || '').toLowerCase() === cleaned.toLowerCase()
    );
    if (fromMine) {
      setVerifiedTrip({
        trip_code: fromMine.trip_code,
        verification_code: fromMine.verification_code || cleaned,
        booking_id: fromMine.id,
        status: fromMine.status,
      });
      notify?.(`Linked to booking ${fromMine.trip_code} · status ${fromMine.status}.`);
      return;
    }
    notify?.(
      'Code not found on your bookings. Book a trip first, or use the code shown after Confirm booking.'
    );
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
    const base = selected?.raw ? overlaysFromTrip(selected.raw) : { polylines: [], markers: [] };
    const lines = [...base.polylines];
    if (adhocLine) lines.push(adhocLine);
    // Rank markers from selected places if no trip geometry
    const markers = [...base.markers];
    if (!markers.length) {
      if (depPlace) {
        markers.push({
          id: 'dep',
          lat: depPlace.lat,
          lng: depPlace.lng,
          label: depPlace.name,
          kind: 'rank',
        });
      }
      if (destPlace) {
        markers.push({
          id: 'dest',
          lat: destPlace.lat,
          lng: destPlace.lng,
          label: destPlace.name,
          kind: 'dest',
        });
      }
    }
    return { polylines: lines, markers };
  }, [selected, adhocLine, depPlace, destPlace]);

  return (
    <div className="pmd">
      <aside className="pmd-sidebar">
        <div className="pmd-brand">
          <span className="pmd-mark">T</span>
          <div>
            <strong>THEMBA</strong>
            <small>TRANSPORT HUB</small>
          </div>
        </div>

        <div className="pmd-profile">
          <div className="pmd-avatar">{initials}</div>
          <div className="pmd-profile-text">
            <span className="pmd-role">PASSENGER DASHBOARD</span>
            <strong>{passengerName}</strong>
          </div>
          <span className="pmd-verified">Verified</span>
        </div>

        {/* 01 Search Trip — SRS */}
        <section className="pmd-section">
          <div className="pmd-section-head">
            <span>01. SEARCH TRIP</span>
          </div>
          {nearestHint && (
            <div className="pmd-nearest">
              <span>Nearest rank from your GPS</span>
              <strong>
                {nearestHint.name} · {nearestHint.distanceKm} km
              </strong>
            </div>
          )}
          <label className="pmd-label">
            Departure
            <select value={departure} onChange={(e) => setDeparture(e.target.value)}>
              {PLACES.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pmd-label">
            Destination
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              {PLACES.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {localFare != null && (
            <div className="pmd-fare-inline">
              Local official fare: <strong>R{localFare}</strong>
            </div>
          )}
          <button type="button" className="pmd-btn primary" onClick={searchTrip} disabled={loading}>
            {loading ? 'Searching…' : 'Search trip'}
          </button>
          <button
            type="button"
            className="pmd-btn ghost"
            onClick={previewRoadRoute}
            disabled={routing}
          >
            {routing ? 'Routing…' : 'Preview road route (map)'}
          </button>
        </section>

        {/* Local fare table — SRS Search Fare */}
        <section className="pmd-section">
          <div className="pmd-section-head">
            <span>02. LOCAL FARES</span>
          </div>
          <table className="pmd-fare-table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>R</th>
              </tr>
            </thead>
            <tbody>
              {FARE_ROWS.map(([a, b, r]) => (
                <tr key={`${a}-${b}`}>
                  <td>{a}</td>
                  <td>{b}</td>
                  <td>{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Verification — SRS central contribution */}
        <section className="pmd-section">
          <div className="pmd-section-head">
            <span>03. TRIP VERIFICATION</span>
          </div>
          {booked?.verification_code && (
            <div className="pmd-code-banner">
              Your code: <strong>{booked.verification_code}</strong>
              <small>
                {booked.trip_code} · booking #{booked.booking_id}
              </small>
            </div>
          )}
          <label className="pmd-label">
            Enter verification code
            <input
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
            />
          </label>
          <button type="button" className="pmd-btn secondary" onClick={confirmVerifyCode}>
            Confirm code
          </button>
          {verifiedTrip && (
            <div className="pmd-verified-trip">
              <strong>Verified for this session</strong>
              <span>
                {verifiedTrip.trip_code || verifiedTrip.origin} · code{' '}
                {verifiedTrip.verification_code}
              </span>
            </div>
          )}
        </section>

        <section className="pmd-section">
          <div className="pmd-section-head">
            <span>04. SAFETY</span>
          </div>
          <button type="button" className="pmd-btn danger" onClick={() => setPanicOpen(true)}>
            Panic button
          </button>
        </section>

        {myBookings.length > 0 && (
          <section className="pmd-section">
            <div className="pmd-section-head">
              <span>MY BOOKINGS</span>
            </div>
            <ul className="pmd-booking-list">
              {myBookings.slice(0, 5).map((b) => (
                <li key={b.id}>
                  <strong>{b.trip_code}</strong>
                  <span>
                    {b.status}
                    {b.verification_code ? ` · ${b.verification_code}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <main className="pmd-main">
        <div className="pmd-map-wrap">
          <ThembaMap
            polylines={mapOverlays.polylines}
            markers={mapOverlays.markers}
            height="100%"
            fitKey={`${selected?.id || departure}-${destination}-${adhocLine?.id || ''}`}
          />
        </div>

        <div className="pmd-results">
          <div className="pmd-results-head">
            <strong>Matching trips</strong>
            <span>{results.length} result(s)</span>
          </div>
          {results.map((trip) => (
            <button
              key={trip.id ?? trip.trip_code + trip.origin}
              type="button"
              className={selected?.id === trip.id ? 'pmd-trip active' : 'pmd-trip'}
              onClick={() => {
                if (!trip.isInfoOnly) setSelected(trip);
              }}
            >
              <div>
                <strong>
                  {trip.origin} → {trip.destination}
                </strong>
                <small>
                  {trip.operator} · {trip.trip_code}
                </small>
                <div className="pmd-trip-meta">
                  <span>{trip.departure}</span>
                  <span className="pmd-status">{trip.status}</span>
                  {trip.seats_available != null && (
                    <span>{trip.seats_available} seats</span>
                  )}
                </div>
                <div className="pmd-trip-meta">
                  <span>
                    Driver: {trip.driver} · {trip.vehicle} {trip.registration}
                  </span>
                </div>
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
                  <small>Show this code to the operator when boarding</small>
                </div>
              )}
            </>
          )}
        </div>
      </main>

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
