/**
 * Passenger hub UI — 3 stages: Desk → Route → Active.
 * - Desk: search trips, Request ride (10 km drivers), verify/book separate, slim notifications
 * - Route: route preview on map (distance/time/fare)
 * - Active: verified trip — live vehicle map + info + panic + feedback
 *
 * search-first: GPS → chosen departure (dashed blue)
 *               chosen departure → destination (amber solid)
 *
 * Ride request flow:
 * - Request ride → POST /api/ride-requests/ (GPS only, NO booking) → drivers within 10 km
 * - My bookings row click → opens trip info panel + loads verify code
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
const OFFICIAL_PLACE_NAMES = new Set(PLACES.map((p) => p.name.toLowerCase()));

function isOfficialCorridor(origin, destination) {
  const o = String(origin || '').toLowerCase();
  const d = String(destination || '').toLowerCase();
  return OFFICIAL_PLACE_NAMES.has(o) && OFFICIAL_PLACE_NAMES.has(d);
}


/** Frontend-only announcements (until backend endpoint exists). */
const PASSENGER_ANNOUNCEMENTS = [
  {
    id: 'a1',
    title: 'Route delay — Ongoye line',
    body: 'Expect delays of 20–35 min on Ongoye → Empangeni due to roadworks near Esikhawini.',
    when: 'Today',
  },
  {
    id: 'a2',
    title: 'Booking confirmed',
    body: 'Request ride alerts drivers within 10 km. Booking/verify stays separate.',
    when: 'System',
  },
  {
    id: 'a3',
    title: 'Fare notice',
    body: 'Official local fares apply (R). Search trip to see the fixed fare for your pair.',
    when: 'System',
  },
];

function placeByName(name) {
  return PLACES.find((p) => p.name === name) || null;
}

function mapApiTrip(t) {
  const origin = t.route?.departure?.name || '—';
  const destination = t.route?.destination?.name || '—';
  let fareNum = t.route?.fare != null ? Number(t.route.fare) : null;
  if (fareNum == null && origin && destination) {
    const local = lookupLocalFare(origin, destination);
    if (local != null) fareNum = Number(local);
  }
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [booked, setBooked] = useState(null);
  const [myBookings, setMyBookings] = useState([]);
  const [passengerNotes, setPassengerNotes] = useState([]);
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
      setResults((Array.isArray([]) ? [] : []).filter((x) => isOfficialCorridor(x.origin, x.destination)));
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

      setResults((Array.isArray(matched) ? matched : []).filter((x) => isOfficialCorridor(x.origin, x.destination)));
      if (matched.length) {
        const pick = matched.find((m) => m.raw) || matched[0];
        setSelected(pick);
      }
    } catch (e) {
      notify?.(e.message);
      setResults((Array.isArray([]) ? [] : []).filter((x) => isOfficialCorridor(x.origin, x.destination)));
    } finally {
      setLoading(false);
    }
  }


  /**
   * Always prefer the device GPS for ride requests so the driver sees the
   * passenger live position — never the departure rank as a substitute.
   */
  function isSecureGeoContext() {
    // Browsers allow geolocation on localhost / HTTPS only — NOT on http://192.168.x.x
    try {
      if (typeof window !== 'undefined' && window.isSecureContext) return true;
      const h = window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    } catch {
      return false;
    }
  }

  function rankFallbackLocation() {
    const name = selected?.origin || departure || 'Ongoye';
    const place =
      (PREDETERMINED_PLACES || []).find(
        (pl) => String(pl.name).toLowerCase() === String(name).toLowerCase()
      ) ||
      (PREDETERMINED_PLACES || []).find(
        (pl) => String(pl.name).toLowerCase() === 'ongoye'
      ) || { lat: -28.854, lng: 31.846 };
    return {
      lat: Number(place.lat),
      lng: Number(place.lng),
      source: 'rank_fallback',
    };
  }

  function readGpsOnce(timeoutMs = 12000) {
    return new Promise((resolve) => {
      if (!navigator.geolocation || !isSecureGeoContext()) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            source: 'gps',
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 5000 }
      );
    });
  }

  // Request ride — GPS when allowed; on LAN http://192.168.x.x use rank coords so demo works.
  async function requestRide() {
    if (!selected?.raw?.id && !selected?.trip_code && !selected?.origin) {
      notify?.('Search and select a trip first, then request a ride.');
      return false;
    }
    setBooking(true);
    try {
      let loc = null;
      if (geo.position?.lat != null && geo.position?.lng != null) {
        loc = {
          lat: Number(geo.position.lat),
          lng: Number(geo.position.lng),
          source: 'gps',
        };
      }
      if (!loc && isSecureGeoContext()) {
        loc = await readGpsOnce(12000);
      }
      if (!loc || loc.lat == null || loc.lng == null) {
        // http://192.168.* is not a secure context — GPS is blocked by the browser
        loc = rankFallbackLocation();
      }
      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        trip_id: selected.raw?.id || undefined,
        location_source: loc.source || 'gps',
      };
      const res = await api.createRideRequest(payload);
      const n = res.drivers_notified ?? 0;
      if (loc.source === 'rank_fallback') {
        notify?.(
          n > 0
            ? `Request sent to ${n} driver(s). GPS unavailable on this address — used departure area for the map.`
            : 'Request recorded (departure area pin). Open driver_demo to view it.'
        );
      } else {
        notify?.(
          n > 0
            ? `Request sent with your live GPS to ${n} driver${n === 1 ? '' : 's'}.`
            : 'Request recorded with your live GPS. Open driver_demo to see it.'
        );
      }
      try {
        const notes = await api.passengerNotifications();
        setPassengerNotes(notes || []);
      } catch {
        /* ignore */
      }
      return true;
    } catch (e) {
      notify?.(e.message || 'Could not send ride request.');
      return false;
    } finally {
      setBooking(false);
    }
  }

  /** Open trip information panel from a My bookings row (after verify / back). */
  async function openBookingDetails(b) {
    setSelectedBookingId(b.id);
    const tripId = b.trip_id || b.trip || b.trip?.id;
    setBooked({
      booking_id: b.id,
      trip_id: tripId,
      verification_code: b.verification_code,
      trip_code: b.trip_code,
    });
    setVerifiedTrip({
      origin: b.route_from || '—',
      destination: b.route_to || '—',
      trip_code: b.trip_code,
      status: b.status,
      fare: b.fare_paid != null ? `R${b.fare_paid}` : undefined,
      driver: b.driver_name,
      operator: b.operator_name,
      departure: b.departure_date || '',
      raw: { id: tripId, trip_code: b.trip_code },
    });
    if (tripId) {
      try {
        if (typeof loadLiveForTrip === 'function') {
          await loadLiveForTrip(tripId);
        }
      } catch {
        /* ignore */
      }
    }
    setViewMode('active');
    notify?.(`Opened trip ${b.trip_code || b.id}`);
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
    const cleaned = verifyInput.trim().toUpperCase();
    if (!cleaned) {
      notify?.('Enter the verification code from the operator.');
      return;
    }

    try {
      // Backend: claim operator walk-in / code → attach booking to this passenger
      const data = await api.verifyBookingCode(cleaned);

      const tripId = data.trip_id || data.trip?.id;
      const origin = data.origin || data.route?.departure?.name || '—';
      const destination = data.destination || data.route?.destination?.name || '—';
      const fare =
        data.fare_paid != null
          ? `R${data.fare_paid}`
          : data.route?.fare != null
            ? `R${data.route.fare}`
            : undefined;

      setBooked({
        booking_id: data.booking_id || data.id,
        trip_id: tripId,
        verification_code: data.verification_code || cleaned,
        trip_code: data.trip_code,
      });

      setVerifiedTrip({
        origin,
        destination,
        trip_code: data.trip_code,
        fare,
        driver: data.driver_name,
        operator: data.operator_name,
        status: data.trip_status || data.status,
        departure: [data.departure_date, data.expected_departure_time || '']
          .filter(Boolean)
          .join(' '),
        raw: {
          id: tripId,
          trip_code: data.trip_code,
          status: data.trip_status,
          route: data.route,
          driver_name: data.driver_name,
          operator_name: data.operator_name,
          seat_capacity: data.seat_capacity,
          seats_taken: data.seats_taken,
        },
      });

      setSelectedBookingId(data.booking_id || data.id);
      setViewMode('active');

      // Refresh My bookings so the trip appears after Back
      try {
        const mine = await api.myBookings();
        setMyBookings(Array.isArray(mine) ? mine : []);
      } catch {
        /* keep current list */
      }

      notify?.(data.message || 'Trip verified — added to My bookings.');
    } catch (err) {
      notify?.(err.message || 'Invalid or expired verification code.');
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
                    <dd>Verified</dd>
                  </div>
                </dl>
              </section>

              <section className="pmd-card">
                <div className="pmd-card-head">
                  <h3>Safety area</h3>
                  <span className="pmd-pill muted">MONITORING ON</span>
                </div>
                <p className="pmd-hint">Emergency assistance available 24/7</p>
                <div className="pmd-btn-row">
                  <button
                    type="button"
                    className="pmd-btn danger"
                    onClick={() => setPanicOpen(true)}
                  >
                    PANIC / GET HELP
                  </button>
                  <button
                    type="button"
                    className="pmd-btn ghost"
                    onClick={() => setFeedbackOpen(true)}
                  >
                    Feedback
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>

        {feedbackOpen && (
          <div className="pmd-modal-backdrop" role="presentation">
            <div className="pmd-modal" role="dialog">
              <h3>Trip feedback</h3>
              <p>
                Share feedback about this verified trip (frontend only — not stored until an API is
                wired).
              </p>
              <textarea
                className="pmd-textarea"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={4}
                placeholder="How was the ride, driver, vehicle…?"
              />
              <div className="pmd-modal-actions">
                <button
                  type="button"
                  className="pmd-btn ghost"
                  onClick={() => setFeedbackOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="pmd-btn primary"
                  onClick={() => {
                    if (!feedbackText.trim()) {
                      notify?.('Write a short note, then submit.');
                      return;
                    }
                    notify?.('Thank you — feedback captured on this device.');
                    setFeedbackText('');
                    setFeedbackOpen(false);
                  }}
                >
                  Submit feedback
                </button>
              </div>
            </div>
          </div>
        )}

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
                <div className="pmd-fare-block pmd-fare-auto">
                  <span>OFFICIAL TRIP FARE</span>
                  <strong>
                    {(selected && selected.fare) ||
                      results[0]?.fare ||
                      (localFare != null ? `R${localFare}` : '—')}
                  </strong>
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
                        ? 'pmd-trip is-selected'
                        : 'pmd-trip'
                    }
                    onClick={() => setSelected(trip)}
                  >
                    <strong>
                      {trip.origin} → {trip.destination}
                    </strong>
                    <small>
                      {trip.operator} · {trip.trip_code}
                      {trip.fare ? ` · ${trip.fare}` : ''}
                    </small>
                    <div className="pmd-trip-meta">
                      <span>{trip.departure}</span>
                      <span className="pmd-status">{trip.status}</span>
                      <span className="pmd-trip-fare">{trip.fare || '—'}</span>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  className="pmd-btn primary block"
                  style={{ marginTop: 12 }}
                  onClick={requestRide}
                  disabled={booking || !selected}
                >
                  {booking ? 'Requesting…' : 'Request a trip'}
                </button>
              </div>
            )}
          </section>

          <section className="pmd-card">
            <h3>Verify a booked trip</h3>
            <p className="pmd-hint">
              Enter the verification code from the operator (or your booking). This books you onto that trip and opens live routing — independent of the search result above.
            </p>
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

        <div className="pmd-desk-grid pmd-desk-lower">
          <section className="pmd-card pmd-bookings">
            <div className="pmd-card-head">
              <h3>My bookings</h3>
              <span className="pmd-pill muted">
                {(myBookings || []).length} upcoming
              </span>
            </div>
            <p className="pmd-hint">
              Verified trips appear here. Tap a row to open trip details again.
            </p>
            {(myBookings || []).length === 0 && (
              <p className="pmd-hint">No trips yet. Enter the operator verification code above to join a trip.</p>
            )}
            <ul className="pmd-booking-list">
              {(myBookings || []).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className={
                      selectedBookingId === b.id
                        ? 'pmd-booking-row active'
                        : 'pmd-booking-row'
                    }
                    onClick={() => openBookingDetails(b)}
                  >
                    <span>
                      <strong>{b.trip_code || `BK-${b.id}`}</strong>
                      <small>
                        {b.status}
                        
                      </small>
                    </span>
                    <span
                      className="pmd-btn ghost"
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                      View details
                    </span>
                  </button>
                </li>
              ))}
            </ul>

          </section>

          <section className="pmd-card">
            <div className="pmd-card-head">
              <h3>Notifications</h3>
              <span className="pmd-pill muted">
                {(passengerNotes || []).filter((n) => !n.read).length}
              </span>
            </div>
            <p className="pmd-hint">Status only (e.g. Driver incoming) — no active trip dump</p>
            <ul className="pmd-notif-list">
              {(passengerNotes || []).length === 0 && (
                <li className="pmd-muted">No messages yet. After a driver accepts, you will see Driver incoming here.</li>
              )}
              {(passengerNotes || []).slice(0, 8).map((n) => (
                <li key={n.id} className={n.read ? 'pmd-notif read' : 'pmd-notif unread'}>
                  <small>
                    {n.created_at
                      ? new Date(n.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}{' '}
                    · {n.title}
                  </small>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
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