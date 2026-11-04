import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import ThembaMap from '../components/ThembaMap.jsx';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  LocateFixed,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  TicketCheck,
  Users,
} from '../components/Icons.jsx';
import '../styles/passengerBooking.css';

/**
 * Passenger portal — three panels, one route map.
 *
 * Panels (left rail, mirrors the demo's passenger dashboard):
 *   1. Search trip       from / destination, search, next departure + available trips
 *   2. My trip           booked trips as tickets: status + trip ID for boarding
 *   3. Journey history    trips already taken / completed, with feedback
 *
 * Trip cards carry exactly two actions: "View trip details" and "Book trip".
 * No map is shown while searching; the route lives only on the trip-details
 * page, at the bottom.
 *
 * URL structure (hash based):
 *   #/passenger                 Search trip (default)
 *   #/passenger/search          Search trip
 *   #/passenger/my-trip         My trip
 *   #/passenger/history         Journey history
 *   #/passenger/trips/<id>      Trip details (route at the bottom)
 *
 * Data:
 *   GET  /transport/api/trips/?from=<town>&to=<town>
 *   GET  /transport/api/trips/<id>/
 *   POST /transport/api/routing/directions/
 */

export const TOWNS = ['Empangeni', 'Richards Bay', 'Esikhawini', 'Ongoye'];

const PANELS = [
  { id: 'search', label: 'Search trip', path: '/passenger/search', icon: Search },
  { id: 'trip', label: 'My trip', path: '/passenger/my-trip', icon: TicketCheck },
  { id: 'history', label: 'Journey history', path: '/passenger/history', icon: History },
];

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

function money(value) {
  return `R${Number(value || 0).toFixed(2)}`;
}

function dateLabel(iso) {
  if (!iso) return 'Date to be confirmed';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function dayLabel(iso) {
  if (!iso) return 'Today';
  const today = new Date();
  const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (iso === isoToday) return 'Today';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
  });
}

function timeLabel(value) {
  return value ? String(value).slice(0, 5) : 'At the rank';
}

function shiftTime(value, minutes) {
  if (!value) return null;
  const [hours, mins] = String(value).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(mins)) return null;
  const total = (hours * 60 + mins + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function durationLabel(trip) {
  const minutes = trip?.duration_minutes ?? trip?.route?.typical_duration_minutes ?? null;
  if (!minutes) return 'Route estimate';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function initials(name) {
  return String(name || 'THEMBA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function coord(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Local start time of a trip (date + departure time). */
function tripStart(trip) {
  if (!trip?.departure_date) return null;
  const date = String(trip.departure_date);
  const rawTime = trip.expected_departure_time
    ? String(trip.expected_departure_time).slice(0, 8)
    : '23:59:59';
  const start = new Date(`${date}T${rawTime}`);
  return Number.isNaN(start.getTime()) ? null : start;
}

/** Trips whose scheduled time has not passed yet can still be booked. */
function isUpcoming(trip) {
  const start = tripStart(trip);
  return start === null ? true : start.getTime() > Date.now();
}

function statusLabel(booking) {
  const status = booking.passenger_display_status || booking.payment_status || booking.status;
  if (status === 'verified') return { text: 'Verified passenger', tone: 'verified' };
  if (status === 'pending') return { text: 'Pending verification', tone: 'pending' };
  if (status === 'refunded' || status === 'partial_refund') return { text: 'Refunded', tone: 'refunded' };
  if (status === 'cancelled') return { text: 'Cancelled', tone: 'refunded' };
  if (status === 'completed') return { text: 'Completed', tone: 'verified' };
  if (status === 'no_show') return { text: 'No show', tone: 'refunded' };
  return { text: status || 'Reserved', tone: 'pending' };
}

/* -------------------------------------------------------------------------- */
/* Hash routing                                                               */
/* -------------------------------------------------------------------------- */

export function parsePassengerHash(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  const raw = String(hash || '').replace(/^#/, '');
  const [path, queryString = ''] = raw.split('?');
  const params = new URLSearchParams(queryString);
  const segments = path.split('/').filter(Boolean);

  const from = params.get('from') || '';
  const to = params.get('to') || '';

  if (segments[0] !== 'passenger') {
    return { panel: 'search', screen: 'panel', tripId: null, from, to };
  }
  if (segments[1] === 'trips' && segments[2]) {
    const id = Number(segments[2]);
    return { panel: 'search', screen: 'details', tripId: Number.isFinite(id) ? id : null, from, to };
  }
  if (segments[1] === 'my-trip') {
    return { panel: 'trip', screen: 'panel', tripId: null, from: '', to: '' };
  }
  if (segments[1] === 'history') {
    return { panel: 'history', screen: 'panel', tripId: null, from: '', to: '' };
  }
  return { panel: 'search', screen: 'panel', tripId: null, from, to };
}

function panelPath(panel) {
  const found = PANELS.find((item) => item.id === panel);
  return found ? found.path : PANELS[0].path;
}

function detailsPath(tripId) {
  return `/passenger/trips/${tripId}`;
}

function pushHash(path) {
  if (typeof window === 'undefined') return;
  const target = `#${path}`;
  if (window.location.hash !== target) window.history.pushState(null, '', target);
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

export function PassengerPolicyCard() {
  return (
    <details className="pb-policy pb-collapse">
      <summary>
        <ShieldCheck size={18} />
        <span>
          <strong>Passenger protection</strong>
          <small>Late arrival, cancellation and refund rules</small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <ul>
        <li>
          <strong>Late arrival</strong>
          <span>Missed trips are not refunded.</span>
        </li>
        <li>
          <strong>Cancellation</strong>
          <span>A 30% fee applies when cancelling within 1 hour of departure.</span>
        </li>
        <li>
          <strong>Driver no-show</strong>
          <span>Full refund if the driver is not at the stated rank by departure time.</span>
        </li>
      </ul>
    </details>
  );
}

function SeatState({ trip }) {
  if (Number(trip.seats_available) <= 0) return <span className="pb-chip">Full</span>;
  return <span className="pb-chip">{trip.seats_available} seats</span>;
}

function TripCard({ trip, booked, signedIn, onDetails, onBook, onSignIn }) {
  const full = Number(trip.seats_available) <= 0;
  return (
    <article className="pb-trip pb-trip--compact">
      <div className="pb-trip-time">
        <strong>{timeLabel(trip.expected_departure_time)}</strong>
        <span>{dayLabel(trip.departure_date)}</span>
      </div>
      <div className="pb-trip-line">
        <div>
          <strong>{trip.route?.departure?.name}</strong>
          <small>{trip.route?.destination?.name}</small>
        </div>
      </div>
      <div className="pb-price">
        <span>per passenger</span>
        <strong>{money(trip.route?.fare)}</strong>
      </div>
      <div className="pb-actions">
        <button className="pb-secondary" type="button" onClick={() => onDetails(trip)}>
          View trip details
        </button>
        {booked ? (
          <span className="pb-chip">Booked</span>
        ) : full ? (
          <span className="pb-chip">Full</span>
        ) : (
          <button
            className="pb-primary"
            type="button"
            onClick={() => (signedIn ? onBook(trip) : onSignIn?.())}
          >
            Book trip
          </button>
        )}
      </div>
    </article>
  );
}

function SearchPanel({ from, to, onFrom, onTo, onSearch, valid, loading, error, trips, hasSearched, bookedTripIds, signedIn, onSignIn, onBook, onDetails }) {
  const nextTrip = trips[0];
  const others = trips.slice(1);

  return (
    <div className="pb-panel">
      <section className="pb-search-card" aria-label="Search trip">
        <div className="pb-eyebrow">PLAN YOUR TRIP</div>
        <div className="pb-search-head">
          <div>
            <h1>Where are you going?</h1>
            <p>Pick your starting town and destination. We resolve the ranks for you.</p>
          </div>
          <span className="pb-dir-icon" aria-hidden="true">
            <LocateFixed size={20} />
          </span>
        </div>

        <div className="pb-search-fields">
          <label>
            <span>STARTING POINT</span>
            <div className="pb-select">
              <LocateFixed size={18} />
              <select value={from} onChange={(event) => onFrom(event.target.value)}>
                <option value="">Choose your town</option>
                {TOWNS.map((town) => (
                  <option key={town} value={town}>{town}</option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          </label>
          <div className="pb-connector" aria-hidden="true">
            <ArrowRight size={18} />
          </div>
          <label>
            <span>DESTINATION</span>
            <div className="pb-select">
              <MapPin size={18} />
              <select value={to} onChange={(event) => onTo(event.target.value)}>
                <option value="">Where to?</option>
                {TOWNS.map((town) => (
                  <option key={town} value={town}>{town}</option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          </label>
        </div>

        {from && to && from === to && (
          <p className="pb-error">Choose two different towns to search.</p>
        )}

        <div className="pb-search-footer">
          <p className="pb-note">
            <ShieldCheck size={15} /> Your exact rank is selected automatically.
          </p>
          <button className="pb-primary" type="button" disabled={!valid || loading} onClick={onSearch}>
            <Search size={16} /> {loading ? 'Searching…' : 'Search trip'}
          </button>
        </div>
      </section>

      {error && <p className="pb-error">{error}</p>}

      {hasSearched && !loading && !error && trips.length === 0 && (
        <section className="pb-route-empty">
          <MapPin size={22} />
          <p>No trips match that journey right now. Try another pair of towns.</p>
        </section>
      )}

      {hasSearched && nextTrip && (
        <>
          <div className="pb-section-head">
            <div>
              <span className="pb-eyebrow pb-plain">NEXT DEPARTURE</span>
              <h3>{timeLabel(nextTrip.expected_departure_time)} · {dayLabel(nextTrip.departure_date)}</h3>
            </div>
          </div>

          <TripCard
            trip={nextTrip}
            booked={bookedTripIds.has(nextTrip.id)}
            signedIn={signedIn}
            onSignIn={onSignIn}
            onBook={onBook}
            onDetails={onDetails}
          />

          {/* Collapsed by default; expands to the other departures on this route. */}
          <details className="pb-available pb-collapse">
            <summary>
              <TicketCheck size={17} />
              <span>
                <strong>Available trips</strong>
                <small>
                  {trips.length} trip{trips.length === 1 ? '' : 's'} on this route
                </small>
              </span>
              <ChevronDown size={16} />
            </summary>

            {others.length > 0 ? (
              <div className="pb-more-list">
                {others.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    booked={bookedTripIds.has(trip.id)}
                    signedIn={signedIn}
                    onSignIn={onSignIn}
                    onBook={onBook}
                    onDetails={onDetails}
                  />
                ))}
              </div>
            ) : (
              <p className="pb-note">
                The next departure above is the only upcoming trip for this route.
              </p>
            )}
          </details>
        </>
      )}

      <PassengerPolicyCard />
    </div>
  );
}

function TicketCard({ booking, notification, onDetails, onCancel, onPanic }) {
  const status = statusLabel(booking);

  return (
    <article className="pb-ticket-card" aria-label={`Ticket ${booking.trip_code}`}>
      <div className="pb-ticket-top">
        <span className={`pb-state pb-${status.tone}`}>
          <i />
          {status.text}
        </span>
        <span>{dateLabel(booking.departure_date)} · {timeLabel(booking.departure_time)}</span>
      </div>

      <div className="pb-ticket-body">
        <div>
          <small>TRIP ID — SHOW THIS WHEN BOARDING</small>
          <strong className="pb-ticket-code">{booking.trip_code}</strong>
          <p>
            {booking.route?.departure?.name || 'Departure rank'} →{' '}
            {booking.route?.destination?.name || 'Destination'}
          </p>
          <p className="pb-ticket-message">
            {notification?.body ||
              (status.tone === 'verified'
                ? 'Keep this notification as proof of travel.'
                : 'The operator must verify your cash booking before departure.')}
          </p>
        </div>
        <div className="pb-fare">
          <small>FARE</small>
          <strong>{money(booking.fare_amount ?? booking.route?.fare)}</strong>
        </div>
      </div>

      <div className="pb-ticket-actions">
        <button className="pb-secondary" type="button" onClick={() => onDetails(booking.trip)}>
          View trip information
        </button>
        {booking.status === 'reserved' && onCancel && (
          <button className="pb-secondary" type="button" onClick={() => onCancel(booking.id)}>
            Cancel
          </button>
        )}
        {booking.status === 'boarded' && onPanic && (
          <button className="pb-danger" type="button" onClick={() => onPanic(booking.id)}>
            Panic
          </button>
        )}
      </div>
    </article>
  );
}

function HistoryPanel({ bookings, feedbackList, onRate, onDetails }) {
  const history = bookings.filter((booking) => !['reserved', 'boarded'].includes(booking.status));
  const completed = history.filter((booking) => booking.status === 'completed');
  const ratedIds = new Set(feedbackList.map((item) => item.booking));

  if (history.length === 0) {
    return (
      <div className="pb-panel">
        <section className="pb-route-empty">
          <History size={22} />
          <p>No journeys yet. Trips you take will appear here with the option to rate them.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="pb-panel">
      <div className="pb-section-head">
        <div>
          <span className="pb-eyebrow pb-plain">JOURNEY HISTORY</span>
          <h3>{history.length} trip{history.length === 1 ? '' : 's'} taken</h3>
        </div>
        <span className="pb-chip">{completed.length} completed</span>
      </div>

      <div className="pb-history-list">
        {history.map((booking) => {
          const status = statusLabel(booking);
          const rated = ratedIds.has(booking.id);
          return (
            <article className="pb-history-row" key={booking.id}>
              <div>
                <strong>
                  {booking.route?.departure?.name || 'Departure'} →{' '}
                  {booking.route?.destination?.name || 'Destination'}
                </strong>
                <small>
                  {dateLabel(booking.departure_date)} · {timeLabel(booking.departure_time)} ·{' '}
                  {booking.trip_code} · {money(booking.fare_amount ?? booking.route?.fare)}
                </small>
              </div>
              <div className="pb-actions">
                <span className={`pb-state pb-${status.tone}`}><i />{status.text}</span>
                {booking.status === 'completed' && !rated && (
                  <button className="pb-primary" type="button" onClick={() => onRate(booking.id)}>
                    Rate this trip
                  </button>
                )}
                {booking.status === 'completed' && (
                  <button className="pb-secondary" type="button" onClick={() => onDetails(booking.trip)}>
                    View trip details
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {feedbackList.length > 0 && (
        <section className="pb-feedback-list">
          <div className="pb-section-head">
            <div>
              <span className="pb-eyebrow pb-plain">MY FEEDBACK</span>
            </div>
          </div>
          {feedbackList.map((item) => (
            <div className="pb-history-row" key={item.id}>
              <div>
                <strong>{item.trip_code} · {item.rating}★</strong>
                <small>
                  {item.route_label}
                  {item.has_complaint ? ` · ${item.category_label}` : ''}
                  {item.status_label ? ` · ${item.status_label}` : ''}
                </small>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function RouteSection({ trip }) {
  const departure = trip?.route?.departure;
  const destination = trip?.route?.destination;
  const depLat = coord(departure?.latitude);
  const depLng = coord(departure?.longitude);
  const destLat = coord(destination?.latitude);
  const destLng = coord(destination?.longitude);
  const hasCoords = depLat !== null && depLng !== null && destLat !== null && destLng !== null;

  const [geometry, setGeometry] = useState([]);
  const [routeError, setRouteError] = useState('');
  const [loadingRoute, setLoadingRoute] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGeometry([]);
    setRouteError('');
    if (!hasCoords) return undefined;
    setLoadingRoute(true);
    api
      .post('/transport/api/routing/directions/', {
        origin: { lat: depLat, lng: depLng },
        destination: { lat: destLat, lng: destLng },
      })
      .then(({ data }) => {
        if (!cancelled) setGeometry(Array.isArray(data.geometry) ? data.geometry : []);
      })
      .catch((err) => {
        if (!cancelled) setRouteError(err.response?.data?.detail || 'Road route unavailable right now.');
      })
      .finally(() => {
        if (!cancelled) setLoadingRoute(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasCoords, depLat, depLng, destLat, destLng]);

  const markers = hasCoords
    ? [
        { id: 'from', lat: depLat, lng: depLng, kind: 'rank', label: departure?.name || 'Boarding rank' },
        { id: 'to', lat: destLat, lng: destLng, kind: 'destination', label: destination?.name || 'Destination' },
      ]
    : [];
  const polylines = geometry.length >= 2
    ? [{ id: 'road', positions: geometry, color: '#18834b', weight: 5 }]
    : [];

  return (
    <section className="pb-info-card pb-route-section" aria-label="Trip route">
      <div className="pb-section-title">
        <h3>Route</h3>
        <span>{durationLabel(trip)}</span>
      </div>
      {hasCoords ? (
        <div className="pb-route-map">
          <ThembaMap
            markers={markers}
            polylines={polylines}
            height="340px"
            fitKey={`${trip?.id}-${geometry.length}`}
          />
        </div>
      ) : (
        <p className="pb-note">
          Coordinates are missing for this rank or destination, so the road map cannot be drawn.
        </p>
      )}
      {loadingRoute && <p className="pb-note">Loading road route…</p>}
      {routeError && !loadingRoute && (
        <p className="pb-note">{routeError} The two endpoints are still marked on the map.</p>
      )}
    </section>
  );
}

function TripDetails({
  trip,
  loading,
  error,
  booked,
  signedIn,
  seats,
  onBack,
  onBook,
  onGroup,
  onSignIn,
  otherTrips = [],
  bookedTripIds,
  onDetails,
}) {
  if (!trip) {
    return (
      <div className="pb-panel">
        <button className="pb-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> Back to search trip
        </button>
        {loading && <p className="pb-note">Loading trip details…</p>}
        {error && <p className="pb-error">{error}</p>}
      </div>
    );
  }

  const full = Number(trip.seats_available) <= 0;

  return (
    <div className="pb-panel">
      <button className="pb-back" type="button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to search trip
      </button>

      <div className="pb-detail-layout">
        <div className="pb-detail-main">
          <section className="pb-info-card">
            <div className="pb-section-title">
              <h3>Your journey</h3>
              <span>{durationLabel(trip)}</span>
            </div>

            <div className="pb-stop">
              <span className="pb-stop-dot pb-live"><LocateFixed size={14} /></span>
              <div>
                <small>START FROM YOUR LOCATION</small>
                <strong>Current location</strong>
                <p>
                  {shiftTime(trip.expected_departure_time, -20)
                    ? `Leave by ${shiftTime(trip.expected_departure_time, -20)} to arrive on time`
                    : 'Leave with enough time to reach the rank'}
                </p>
              </div>
              <time>{shiftTime(trip.expected_departure_time, -20) || '—'}</time>
            </div>

            <div className="pb-stop">
              <span className="pb-stop-dot"><TicketCheck size={14} /></span>
              <div>
                <small>BOARDING POINT</small>
                <strong>{trip.route?.departure?.name || 'Departure rank'}</strong>
                <p>{trip.route?.departure?.area || 'Departure rank'}</p>
              </div>
              <time>{timeLabel(trip.expected_departure_time)}</time>
            </div>

            <div className="pb-stop">
              <span className="pb-stop-dot pb-destination"><MapPin size={14} /></span>
              <div>
                <small>DESTINATION</small>
                <strong>{trip.route?.destination?.name || 'Destination'}</strong>
                <p>{trip.route?.destination?.area || 'Destination rank'}</p>
              </div>
              <time>
                {trip.duration_minutes
                  ? shiftTime(trip.expected_departure_time, trip.duration_minutes)
                  : durationLabel(trip)}
              </time>
            </div>
          </section>

          <section className="pb-info-card">
            <div className="pb-section-title">
              <h3>Driver &amp; operator</h3>
              <span>{trip.vehicle_plate || 'Vehicle to be confirmed'}</span>
            </div>
            <div className="pb-driver">
              <div className="pb-avatar">{initials(trip.driver_name)}</div>
              <div>
                <strong>{trip.driver_name || 'Driver to be assigned'}</strong>
                <span>
                  {trip.driver_trips_count
                    ? `Professional driver · ${trip.driver_trips_count} trips`
                    : 'Professional driver'}
                </span>
                <b>
                  <Star size={13} className="pb-star" />
                  {trip.driver_rating != null ? trip.driver_rating : 'New'}
                  {trip.driver_rating_count
                    ? <small> ({trip.driver_rating_count} reviews)</small>
                    : null}
                </b>
              </div>
              <div className="pb-operator">
                <small>OPERATOR</small>
                <strong>{trip.operator_name || 'THEMBA operator'}</strong>
                <span>{trip.trip_code}</span>
              </div>
            </div>
          </section>

          <details className="pb-policy pb-collapse">
            <summary>
              <ShieldCheck size={18} />
              <span>
                <strong>Payment &amp; cancellation</strong>
                <small>Card, cash and refund rules</small>
              </span>
              <ChevronDown size={16} />
            </summary>
            <ul>
              <li>
                <strong>Card</strong>
                <span>Verified instantly; this notification is your proof of travel.</span>
              </li>
              <li>
                <strong>Cash</strong>
                <span>Pending until the operator verifies you 30 minutes before departure.</span>
              </li>
              <li>
                <strong>Refunds</strong>
                <span>Full refund &gt; 1 hour out, 30% fee within 1 hour, none after departure.</span>
              </li>
            </ul>
          </details>
        </div>

        <aside className="pb-summary">
          <span className="pb-eyebrow pb-plain">BOOKING SUMMARY</span>
          <div className="pb-summary-row">
            <span>Date</span>
            <strong>{dateLabel(trip.departure_date)}</strong>
          </div>
          <div className="pb-summary-row">
            <span>Departure</span>
            <strong>{timeLabel(trip.expected_departure_time)}</strong>
          </div>
          <div className="pb-summary-row">
            <span>Trip ID</span>
            <strong>{trip.trip_code}</strong>
          </div>
          <div className="pb-summary-row">
            <span>Seats left</span>
            <strong>{trip.seats_available}</strong>
          </div>
          <div className="pb-total">
            <span>Total</span>
            <strong>{money(trip.route?.fare)}</strong>
          </div>

          {booked ? (
            <span className="pb-chip">Already booked</span>
          ) : full ? (
            <span className="pb-chip">Trip is full</span>
          ) : (
            <button
              className="pb-primary pb-wide"
              type="button"
              onClick={() => (signedIn ? onBook(trip) : onSignIn?.())}
            >
              {signedIn ? 'Book this trip' : 'Sign in to book'} <ArrowRight size={16} />
            </button>
          )}

          {signedIn && !booked && !full && Number(trip.seats_available) > 1 && (
            <button className="pb-text-button" type="button" onClick={() => onGroup?.(trip)}>
              <Users size={14} /> Travelling with others? Book a group
            </button>
          )}

          <p className="pb-note" style={{ marginTop: 12 }}>
            <CheckCircle2 size={14} /> Secure booking · Proof sent instantly
          </p>
        </aside>
      </div>

      {/* Other upcoming departures on the same route (collapsed by default). */}
      {otherTrips.length > 0 && (
        <details className="pb-available pb-collapse">
          <summary>
            <TicketCheck size={17} />
            <span>
              <strong>Available trips</strong>
              <small>
                {otherTrips.length} other upcoming trip{otherTrips.length === 1 ? '' : 's'} on this route
              </small>
            </span>
            <ChevronDown size={16} />
          </summary>
          <div className="pb-more-list">
            {otherTrips.map((other) => (
              <TripCard
                key={other.id}
                trip={other}
                booked={bookedTripIds.has(other.id)}
                signedIn={signedIn}
                onSignIn={onSignIn}
                onBook={onBook}
                onDetails={onDetails}
              />
            ))}
          </div>
        </details>
      )}

      {/* The route lives here only — bottom of the trip-details page. */}
      <RouteSection trip={trip} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Portal                                                                     */
/* -------------------------------------------------------------------------- */

export default function PassengerBookingFlow({
  trips = [],
  bookings = [],
  loading = false,
  error = '',
  signedIn = false,
  onSignIn,
  from = '',
  to = '',
  onSearch,
  onBook,
  onGroup,
  notifications = [],
  onCancel,
  onPanic,
  feedbackList = [],
  onRate,
  announcements = [],
  passengerName = 'traveller',
}) {
  const [panel, setPanel] = useState('search');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [localFrom, setLocalFrom] = useState(from || '');
  const [localTo, setLocalTo] = useState(to || '');
  const [hasSearched, setHasSearched] = useState(false);

  const searchRef = useRef(onSearch);
  searchRef.current = onSearch;
  const detailRequest = useRef(0);

  const valid = Boolean(localFrom && localTo && localFrom !== localTo);

  const activeBookings = useMemo(
    () => bookings.filter((booking) => ['reserved', 'boarded'].includes(booking.status)),
    [bookings]
  );

  const bookedTripIds = useMemo(
    () =>
      new Set(
        bookings
          .filter((booking) => !['cancelled', 'no_show'].includes(booking.status))
          .map((booking) => booking.trip)
      ),
    [bookings]
  );

  const otherTripsForDetail = useMemo(() => {
    if (!detail) return [];
    return trips.filter(
      (item) =>
        item.id !== detail.id &&
        isUpcoming(item) &&
        (!detail.route?.id || item.route?.id === detail.route.id)
    );
  }, [trips, detail]);

  // Departures whose scheduled time has passed cannot be booked, so they are
  // not offered anywhere in the search experience.
  const upcomingTrips = useMemo(() => trips.filter(isUpcoming), [trips]);

  async function loadDetail(tripId) {
    if (!tripId) return;
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError('');
    try {
      const { data } = await api.get(`/transport/api/trips/${tripId}/`);
      if (request === detailRequest.current) setDetail(data);
    } catch (err) {
      if (request !== detailRequest.current) return;
      const fallback = trips.find((trip) => trip.id === tripId) || null;
      setDetail(fallback);
      if (!fallback) setDetailError('This trip is no longer available. Choose another departure.');
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  function applyHash() {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/passenger');
    }
    const next = parsePassengerHash();
    if (next.from) setLocalFrom(next.from);
    if (next.to) setLocalTo(next.to);

    if (next.screen === 'details') {
      setPanel('search');
      if (next.from && next.to) {
        setHasSearched(true);
        searchRef.current?.(next.from, next.to);
      }
      setDetail((current) => (current?.id === next.tripId ? current : null));
      loadDetail(next.tripId);
      return;
    }
    setDetail(null);
    setPanel(next.panel);
    if (next.panel === 'search' && next.from && next.to) {
      setHasSearched(true);
      searchRef.current?.(next.from, next.to);
    }
  }

  useEffect(() => {
    applyHash();
    const handler = () => applyHash();
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (from) setLocalFrom(from);
  }, [from]);

  useEffect(() => {
    if (to) setLocalTo(to);
  }, [to]);

  function goPanel(nextPanel) {
    setPanel(nextPanel);
    setDetail(null);
    pushHash(panelPath(nextPanel));
  }

  function runSearch() {
    if (!valid) return;
    setHasSearched(true);
    searchRef.current?.(localFrom, localTo);
    pushHash(`/passenger/search?from=${encodeURIComponent(localFrom)}&to=${encodeURIComponent(localTo)}`);
  }

  function openDetails(trip) {
    setDetail(trip);
    setDetailError('');
    pushHash(detailsPath(trip.id));
    loadDetail(trip.id);
  }

  function closeDetails() {
    setDetail(null);
    pushHash('/passenger/search');
  }

  const onDetails = (trip) => {
    if (typeof trip === 'number') {
      setPanel('search');
      setDetail(trips.find((item) => item.id === trip) || null);
      pushHash(detailsPath(trip));
      loadDetail(trip);
      return;
    }
    openDetails(trip);
  };

  const notificationsByBooking = useMemo(() => {
    const map = new Map();
    for (const item of notifications) {
      if (!map.has(item.booking_id)) map.set(item.booking_id, item);
    }
    return map;
  }, [notifications]);

  return (
    <div className="pb-portal">
      <aside className="pb-portal-nav" aria-label="Passenger sections">
        <div className="pb-portal-title">PASSENGER PORTAL</div>
        <nav>
          {PANELS.map((item) => {
            const Icon = item.icon;
            const active = panel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'pb-nav-button active' : 'pb-nav-button'}
                onClick={() => goPanel(item.id)}
              >
                <Icon size={18} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="pb-portal-profile">
          <div className="pb-avatar">{initials(passengerName)}</div>
          <div>
            <strong>{passengerName}</strong>
            <span>Passenger</span>
          </div>
        </div>
      </aside>

      <div className="pb-portal-body">
        <div className="pb-portal-heading">
          <div>
            <span className="pb-eyebrow pb-plain">PASSENGER DASHBOARD</span>
            <h2>
              {panel === 'search' && (detail ? 'Trip details' : 'Search trip')}
              {panel === 'trip' && 'My trip'}
              {panel === 'history' && 'Journey history'}
            </h2>
          </div>
          {panel === 'search' && !detail && (
            <span className="pb-chip">
              <CalendarDays size={14} /> {new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        {panel === 'search' && !detail && (
          <SearchPanel
            from={localFrom}
            to={localTo}
            onFrom={(value) => {
              setLocalFrom(value);
              setHasSearched(false);
            }}
            onTo={(value) => {
              setLocalTo(value);
              setHasSearched(false);
            }}
            onSearch={runSearch}
            valid={valid}
            loading={loading}
            error={error}
            trips={upcomingTrips}
            hasSearched={hasSearched}
            bookedTripIds={bookedTripIds}
            signedIn={signedIn}
            onSignIn={onSignIn}
            onBook={onBook}
            onDetails={onDetails}
          />
        )}

        {panel === 'search' && detail && (
          <TripDetails
            trip={detail}
            loading={detailLoading}
            error={detailError}
            booked={bookedTripIds.has(detail.id)}
            signedIn={signedIn}
            seats={detail.seats_available}
            onBack={closeDetails}
            onBook={onBook}
            onGroup={onGroup}
            onSignIn={onSignIn}
            otherTrips={otherTripsForDetail}
            bookedTripIds={bookedTripIds}
            onDetails={onDetails}
          />
        )}

        {panel === 'trip' && (
          <div className="pb-panel">
            <div className="pb-section-head">
              <div>
                <span className="pb-eyebrow pb-plain">MY TRIP</span>
                <h3>{activeBookings.length} active booking{activeBookings.length === 1 ? '' : 's'}</h3>
              </div>
            </div>

            {activeBookings.length === 0 && (
              <section className="pb-route-empty">
                <TicketCheck size={22} />
                <p>No active trips. Book a trip from the Search trip panel and your ticket appears here.</p>
                <button className="pb-secondary" type="button" onClick={() => goPanel('search')}>
                  Search trip
                </button>
              </section>
            )}

            {activeBookings.map((booking) => (
              <TicketCard
                key={booking.id}
                booking={booking}
                notification={notificationsByBooking.get(booking.id)}
                onDetails={onDetails}
                onCancel={onCancel}
                onPanic={onPanic}
              />
            ))}
          </div>
        )}

        {panel === 'history' && (
          <HistoryPanel
            bookings={bookings}
            feedbackList={feedbackList}
            onRate={onRate}
            onDetails={onDetails}
          />
        )}

        {panel === 'search' && !detail && announcements.length > 0 && (
          <details className="pb-policy pb-collapse">
            <summary>
              <Bell size={18} />
              <span>
                <strong>Service announcements</strong>
                <small>{announcements.length} update{announcements.length === 1 ? '' : 's'}</small>
              </span>
              <ChevronDown size={16} />
            </summary>
            <ul>
              {announcements.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.body}
                    {item.operator_name ? ` — ${item.operator_name}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
