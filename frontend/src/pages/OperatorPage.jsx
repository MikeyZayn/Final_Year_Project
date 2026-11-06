/**
 * Operator UI from Final_Year_Project — same modules and flow:
 * My trips → engage → manifest → verify bookings → walk-in + verification code.
 * Read-only assigned rank memberships (no rank requests).
 * Wired to integrated /api/ endpoints.
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { selectOperatorPriorityTrip, groupOperatorTrips, operatorTripLabel } from '../services/operatorTrips.js';
import '../styles/operatorFyp.css';

export default function OperatorPage({ notify, isAdmin }) {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [t, m] = await Promise.all([
        api.myTrips().catch(async (err) => {
          if (isAdmin) return api.listTrips();
          throw err;
        }),
        api.myMemberships().catch(() => []),
      ]);
      setTrips(Array.isArray(t) ? t : []);
      setMemberships(Array.isArray(m) ? m : []);
    } catch (err) {
      setError(err.message || 'Could not load operator data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="app light fyp-operator">
        <article className="module module-wide">
          <p className="muted">Loading operator data…</p>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app light fyp-operator">
        <article className="module module-wide">
          <p style={{ color: 'var(--danger)' }}>{error}</p>
          <button type="button" className="secondary-button" onClick={load}>
            Retry
          </button>
        </article>
      </div>
    );
  }

  if (selectedTripId) {
    return (
      <div className="app light fyp-operator">
        <OperatorTripDetail
          tripId={selectedTripId}
          onBack={() => {
            setSelectedTripId(null);
            load();
          }}
          notify={notify}
        />
      </div>
    );
  }

  return (
    <div className="app light fyp-operator">
      <div className="dashboard-grid">
        <OperatorTripsList trips={selectOperatorPriorityTrip(trips) ? [selectOperatorPriorityTrip(trips)] : []}
          onSelectTrip={setSelectedTripId} title="My trips" />
        <details className="module module-wide">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>All my trips ({trips.length})</summary>
          <OperatorTripsList trips={trips} onSelectTrip={setSelectedTripId} showHistory title="All my trips" />
        </details>
        <OperatorMemberships memberships={memberships} />
        <article className="module module-wide" style={{ opacity: 0.55 }}>
          <div className="module-heading">
            <span>Complaints</span>
            <span className="module-number">UI preview</span>
          </div>
          <p className="muted">
            Central contribution — review passenger feedback for trips you operated (SRS).
          </p>
        </article>
      </div>
    </div>
  );
}

function OperatorTripsList({ trips, onSelectTrip, showHistory = false, title = 'My trips' }) {
  const groups = showHistory ? groupOperatorTrips(trips) : [
    {title: trips[0]?.is_engaged ? 'Currently operating' : 'Next assigned trip', trips},
  ];
  return (
    <article className="module module-wide">
      <div className="module-heading"><span>{title}</span><span className="module-number">{trips.length}</span></div>
      {trips.length === 0 && <p className="muted">No active or upcoming trip assigned.</p>}
      {groups.filter(g => g.trips.length).map(group => (
        <section key={group.title}>
          <div className="section-title" style={{ marginTop: 10 }}>{group.title}</div>
          {group.trips.map(t => <TripRow key={t.id} trip={t} onClick={() => onSelectTrip(t.id)} />)}
        </section>
      ))}
    </article>
  );
}

function TripRow({ trip, onClick }) {
  const refunded = trip.refund_status === 'refunded';
  const statusColor = refunded ? 'var(--success)' :
    trip.status === 'cancelled' ? 'var(--danger)' :
    trip.status === 'boarding' || trip.status === 'in_progress' ? 'var(--success)' :
    trip.status === 'completed' ? 'var(--muted)' : 'var(--accent)';
  const from = trip.route?.departure?.name || '—';
  const to = trip.route?.destination?.name || '—';
  return (
    <button className="trip-row" onClick={onClick} type="button">
      <span><strong>{from} → {to}</strong><small>
        {trip.trip_code} · {trip.departure_date}
        {trip.expected_departure_time ? ` · ${String(trip.expected_departure_time).slice(0, 5)}` : ''}
        {' · '}{trip.seats_taken}/{trip.seat_capacity} seats
      </small></span>
      <span className="status-pill" style={{ borderColor: statusColor, color: statusColor }}>
        {operatorTripLabel(trip)}
      </span>
    </button>
  );
}

function OperatorMemberships({ memberships }) {
  return (
    <article className="module">
      <div className="module-heading">
        <span>My rank memberships</span>
        <span className="module-number">{memberships.length}</span>
      </div>
      {memberships.length === 0 && (
        <p className="muted">No rank assigned yet.</p>
      )}
      {memberships.map((m) => (
        <div className="trip-row" key={m.id}>
          <span>
            <strong>{m.rank?.name || 'Rank'}</strong>
            <small>{m.rank?.area || ''}</small>
          </span>
          <span
            className="status-pill"
            style={{
              borderColor: m.status === 'active' ? 'var(--success)' : 'var(--accent)',
              color: m.status === 'active' ? 'var(--success)' : 'var(--accent)',
            }}
          >
            {m.status}
          </span>
        </div>
      ))}
    </article>
  );
}

function OperatorTripDetail({ tripId, onBack, notify }) {
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInNokName, setWalkInNokName] = useState('');
  const [walkInNokPhone, setWalkInNokPhone] = useState('');
  const [lastWalkInCode, setLastWalkInCode] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.manifest(tripId);
      setTrip(data);
    } catch (err) {
      notify?.(err.message || 'Could not load manifest.');
      setTrip(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function engage() {
    try {
      await api.engage(tripId);
      notify?.('Trip engaged — boarding open.');
      await load();
    } catch (err) {
      notify?.(err.message || 'Could not engage trip.');
    }
  }

  async function verifyBooking(bookingId) {
    setVerifyingId(bookingId);
    try {
      await api.verifyBooking(tripId, bookingId, '');
      notify?.('Passenger verified and marked boarded.');
      await load();
    } catch (err) {
      notify?.(err.message || 'Verify failed.');
    } finally {
      setVerifyingId(null);
    }
  }

  async function registerWalkIn() {
    if (!walkInName.trim()) {
      notify?.('Name is required.');
      return;
    }
    if (!walkInNokName.trim() || !walkInNokPhone.trim()) {
      notify?.('Next of kin name and phone are required.');
      return;
    }
    try {
      const data = await api.walkIn(tripId, {
        name: walkInName,
        phone: walkInPhone,
        next_of_kin_name: walkInNokName,
        next_of_kin_phone: walkInNokPhone,
      });
      setLastWalkInCode({ name: walkInName, code: data.verification_code });
      notify?.(
        data.verification_code
          ? `Walk-in registered · code ${data.verification_code}`
          : 'Walk-in registered.'
      );
      setWalkInName('');
      setWalkInPhone('');
      setWalkInNokName('');
      setWalkInNokPhone('');
      await load();
    } catch (err) {
      notify?.(err.message || 'Walk-in failed.');
    }
  }

  if (loading || !trip) {
    return (
      <article className="module module-wide">
        <p className="muted">{loading ? 'Loading manifest…' : 'Trip not found.'}</p>
        <button type="button" className="secondary-button" onClick={onBack}>
          ← Back
        </button>
      </article>
    );
  }

  const engaged = Boolean(trip.is_engaged || trip.engaged_at || trip.status === 'boarding' || trip.status === 'in_progress');

  if (['completed', 'cancelled'].includes(trip.status)) return (
    <article className="module module-wide">
      <div className="module-heading"><span>{trip.trip_code} · {operatorTripLabel(trip)}</span>
        <button className="secondary-button" onClick={onBack} type="button">← Back</button>
      </div>
      <p className="muted">This is a finished trip. It no longer holds your operating assignment.</p>
    </article>
  );

  if (!engaged) {
    return (
      <>
        <article className="module module-wide">
          <div className="module-heading">
            <span>{trip.trip_code}</span>
            <button className="secondary-button" onClick={onBack} type="button">
              ← Back
            </button>
          </div>
          <h3 style={{ margin: '8px 0' }}>
            {trip.route?.departure?.name} → {trip.route?.destination?.name}
          </h3>
          <div className="route-summary">
            <div>
              <span className="route-label">Date</span>
              <strong>{trip.departure_date}</strong>
            </div>
            <div>
              <span className="route-label">Time</span>
              <strong>{String(trip.expected_departure_time || '—').slice(0, 5)}</strong>
            </div>
            <div>
              <span className="route-label">Driver</span>
              <strong>{trip.driver_name || 'Unassigned'}</strong>
            </div>
            <div>
              <span className="route-label">Vehicle</span>
              <strong>{trip.vehicle_plate || 'Unassigned'}</strong>
            </div>
            <div>
              <span className="route-label">Seats</span>
              <strong>
                {trip.seats_taken}/{trip.seat_capacity}
              </strong>
            </div>
            <div>
              <span className="route-label">Status</span>
              <strong>{trip.status}</strong>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            Engage this trip to open boarding. Once the operator verifies the driver and vehicle,
            the trip starts automatically at its scheduled departure time.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button className="secondary-button" onClick={onBack} type="button">
              Not now
            </button>
            <button className="primary-button" onClick={engage} type="button">
              Yes, work this trip
            </button>
          </div>
        </article>
      </>
    );
  }

  const booked = trip.booked_passengers || [];
  const walkIns = trip.walk_in_passengers || [];
  const isFull = trip.seats_taken >= trip.seat_capacity;

  return (
    <>
      <article className="module module-wide">
        <div className="module-heading">
          <span>{trip.trip_code} · {operatorTripLabel(trip)}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="secondary-button" onClick={onBack} type="button">
              ← Back
            </button>
          </div>
        </div>
        <h3 style={{ margin: '8px 0' }}>
          {trip.route?.departure?.name} → {trip.route?.destination?.name}
        </h3>
        <div className="route-summary">
          <div>
            <span className="route-label">Date</span>
            <strong>{trip.departure_date}</strong>
          </div>
          <div>
            <span className="route-label">Time</span>
            <strong>{String(trip.expected_departure_time || '—').slice(0, 5)}</strong>
          </div>
          <div>
            <span className="route-label">Driver</span>
            <strong>{trip.driver_name || 'Unassigned'}</strong>
          </div>
          <div>
            <span className="route-label">Vehicle</span>
            <strong>{trip.vehicle_plate || 'Unassigned'}</strong>
          </div>
          <div>
            <span className="route-label">Seats</span>
            <strong style={{ color: isFull ? 'var(--danger)' : undefined }}>
              {trip.seats_taken}/{trip.seat_capacity}
            </strong>
          </div>
          <div>
            <span className="route-label">Status</span>
            <strong>{trip.status}</strong>
          </div>
        </div>
      </article>

      <article className="module module-wide">
        <div className="module-heading">
          <span>Booked passengers (app users)</span>
          <span className="module-number">{booked.length}</span>
        </div>
        {booked.length === 0 && <p className="muted">No bookings yet.</p>}
        {booked.map((b) => (
          <div className="trip-row" key={b.booking_id}>
            <span>
              <strong>{b.name}</strong>
              <small>
                {b.phone}
                {b.verification_code ? ` · code ${b.verification_code}` : ''}
                {b.code_verified ? ' · verified' : ''}
              </small>
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => verifyBooking(b.booking_id)}
              disabled={verifyingId === b.booking_id || b.status === 'boarded'}
            >
              {b.status === 'boarded'
                ? 'Boarded'
                : verifyingId === b.booking_id
                  ? 'Verifying…'
                  : 'Verify + board'}
            </button>
          </div>
        ))}
      </article>

      <article className="module module-wide">
        <div className="module-heading">
          <span>Walk-in passengers</span>
          <span className="module-number">{walkIns.length}</span>
        </div>
        <p className="muted">
          Passengers without the app — added to the manifest with a next-of-kin record (FYP).
        </p>
        <div className="form-grid" style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          <label>
            Full name
            <input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
          </label>
          <label>
            Phone
            <input value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
          </label>
          <label>
            Next of kin — name
            <input value={walkInNokName} onChange={(e) => setWalkInNokName(e.target.value)} />
          </label>
          <label>
            Next of kin — phone
            <input value={walkInNokPhone} onChange={(e) => setWalkInNokPhone(e.target.value)} />
          </label>
        </div>
        <button
          className="primary-button"
          onClick={registerWalkIn}
          disabled={isFull}
          type="button"
          style={{ marginTop: 12 }}
        >
          {isFull ? 'Trip is full' : 'Register + issue code'}
        </button>

        {lastWalkInCode && (
          <p className="muted" style={{ marginTop: 12 }}>
            Latest walk-in code for <strong>{lastWalkInCode.name}</strong>:{' '}
            <strong>{lastWalkInCode.code}</strong>
          </p>
        )}

        {walkIns.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>
              Registered walk-ins
            </div>
            {walkIns.map((b) => (
              <div className="trip-row" key={b.booking_id}>
                <span>
                  <strong>{b.name}</strong>
                  <small>
                    NOK: {b.next_of_kin_name} ({b.next_of_kin_phone})
                    {b.verification_code ? ` · code ${b.verification_code}` : ''}
                  </small>
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => verifyBooking(b.booking_id)}
                  disabled={b.status === 'boarded'}
                >
                  {b.status === 'boarded' ? 'Boarded' : 'Board'}
                </button>
              </div>
            ))}
          </>
        )}
      </article>
    </>
  );
}