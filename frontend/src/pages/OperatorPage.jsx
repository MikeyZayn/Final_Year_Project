/**
 * Operator UI from Final_Year_Project — same modules and flow:
 * My trips → engage → manifest → verify bookings → walk-in + verification code.
 * Rank memberships + request rank.
 * Wired to integrated /api/ endpoints.
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import '../styles/operatorFyp.css';

export default function OperatorPage({ notify, isAdmin }) {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [t, m, a, d, c] = await Promise.all([
        api.myTrips().catch(async (err) => {
          if (isAdmin) return api.listTrips();
          throw err;
        }),
        api.myMemberships().catch(() => []),
        api.listAnnouncements().catch(() => []),
        api.listOperatorDrivers().catch(() => []),
        api.listOperatorComplaints().catch(() => []),
      ]);
      setTrips(Array.isArray(t) ? t : []);
      setMemberships(Array.isArray(m) ? m : []);
      setAnnouncements(Array.isArray(a) ? a : []);
      setDrivers(Array.isArray(d) ? d : []);
      setComplaints(Array.isArray(c) ? c : []);
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
      <div className="fyp-operator">
        <article className="module module-wide">
          <p className="muted">Loading operator data…</p>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fyp-operator">
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
      <div className="fyp-operator">
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

  if (selectedDriverId) {
    return (
      <div className="fyp-operator">
        <OperatorDriverDetail
          driverId={selectedDriverId}
          onBack={() => setSelectedDriverId(null)}
        />
      </div>
    );
  }

  return (
    <div className="fyp-operator">
      <div className="dashboard-grid">
        <OperatorTripsList trips={trips} onSelectTrip={setSelectedTripId} />
        <OperatorMemberships memberships={memberships} />
        <OperatorRequestRank notify={notify} onRequested={load} />
        <OperatorAnnouncements announcements={announcements} onSaved={load} />
        <OperatorDriversList drivers={drivers} onSelectDriver={setSelectedDriverId} />
        <OperatorComplaintsList complaints={complaints} onResolve={async (id, status) => {
          await api.resolveOperatorComplaint(id, status);
          await load();
        }} />
      </div>
    </div>
  );
}

function OperatorTripsList({ trips, onSelectTrip }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrips = trips.filter((t) => t.departure_date === today);
  const upcoming = trips.filter((t) => t.departure_date > today);
  const past = trips.filter((t) => t.departure_date < today);

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>My trips</span>
        <span className="module-number">{trips.length}</span>
      </div>

      {trips.length === 0 && (
        <p className="muted">No trips assigned to you. Trips are scheduled by rank admins.</p>
      )}

      {todayTrips.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}>
            Today
          </div>
          {todayTrips.map((t) => (
            <TripRow key={t.id} trip={t} onClick={() => onSelectTrip(t.id)} />
          ))}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>
            Upcoming
          </div>
          {upcoming.map((t) => (
            <TripRow key={t.id} trip={t} onClick={() => onSelectTrip(t.id)} />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>
            Earlier
          </div>
          {past.slice(0, 5).map((t) => (
            <TripRow key={t.id} trip={t} onClick={() => onSelectTrip(t.id)} />
          ))}
        </>
      )}
    </article>
  );
}

function TripRow({ trip, onClick }) {
  const statusColor =
    trip.status === 'flagged'
      ? 'var(--danger)'
      : trip.status === 'boarding' || trip.status === 'in_progress'
        ? 'var(--success)'
        : trip.status === 'completed'
          ? 'var(--muted)'
          : 'var(--accent)';

  const from = trip.route?.departure?.name || '—';
  const to = trip.route?.destination?.name || '—';

  return (
    <button className="trip-row" onClick={onClick} type="button">
      <span>
        <strong>
          {from} → {to}
        </strong>
        <small>
          {trip.trip_code} · {trip.departure_date}
          {trip.expected_departure_time
            ? ` · ${String(trip.expected_departure_time).slice(0, 5)}`
            : ''}
          {' · '}
          {trip.seats_taken}/{trip.seat_capacity} seats
        </small>
      </span>
      <span className="status-pill" style={{ borderColor: statusColor, color: statusColor }}>
        {trip.status}
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
        <p className="muted">No memberships yet. Request a rank.</p>
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

function OperatorRequestRank({ notify, onRequested }) {
  const [ranks, setRanks] = useState([]);
  const [myRankIds, setMyRankIds] = useState([]);
  const [rankId, setRankId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function loadOptions() {
    try {
      const [rankRes, memRes] = await Promise.all([
        api.listRanks(),
        api.myMemberships().catch(() => []),
      ]);
      setRanks(rankRes);
      const mine = (memRes || []).map((m) => m.rank?.id).filter(Boolean);
      setMyRankIds(mine);
      const available = rankRes.filter((r) => !mine.includes(r.id));
      if (available[0]) setRankId(String(available[0].id));
    } catch {
      setError('Could not load ranks.');
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  async function submit() {
    setError('');
    if (!rankId) {
      setError('Pick a rank.');
      return;
    }
    setBusy(true);
    try {
      await api.requestRank(Number(rankId), notes);
      notify?.('Rank request submitted for admin approval.');
      setNotes('');
      setShowForm(false);
      await loadOptions();
      onRequested?.();
    } catch (err) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setBusy(false);
    }
  }

  const availableRanks = ranks.filter((r) => !myRankIds.includes(r.id));

  return (
    <article className="module">
      <div className="module-heading">
        <span>Request a rank</span>
        <span className="module-number">Approval required</span>
      </div>
      <p className="muted">
        Apply to operate at another rank. The rank&apos;s admin reviews and approves.
      </p>

      {!showForm && (
        <button className="secondary-button" onClick={() => setShowForm(true)} type="button">
          Request rank
        </button>
      )}

      {showForm &&
        (availableRanks.length === 0 ? (
          <p className="muted">You already cover all available ranks, or none are seeded.</p>
        ) : (
          <>
            <label>
              Rank
              <select value={rankId} onChange={(e) => setRankId(e.target.value)}>
                {availableRanks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.area ? `· ${r.area}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </label>
            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={submit} disabled={busy}>
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </>
        ))}
    </article>
  );
}

function OperatorAnnouncements({ announcements = [], onSaved }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required.');
      return;
    }

    setBusy(true);
    try {
      await api.createAnnouncement({ title, message, audience });
      setTitle('');
      setMessage('');
      setAudience('all');
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Could not create announcement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Announcements</span>
        <span className="module-number">{announcements.length}</span>
      </div>

      <div className="form-grid" style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Route update" />
        </label>
        <label>
          Audience
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">All users</option>
            <option value="operators">Operators</option>
            <option value="drivers">Drivers</option>
            <option value="passengers">Passengers</option>
          </select>
        </label>
        <label>
          Message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Share route, weather, or service updates" />
        </label>
      </div>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <button className="primary-button" type="button" onClick={submit} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Posting…' : 'Post announcement'}
      </button>

      {announcements.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>Recent announcements</div>
          {announcements.slice(0, 4).map((a) => (
            <div className="trip-row" key={a.id}>
              <span>
                <strong>{a.title}</strong>
                <small>
                  {a.audience} · {a.created_by_name || 'Operator'} ·{' '}
                  {new Date(a.created_at).toLocaleString()}
                </small>
              </span>
              <span className="status-pill" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                {a.audience}
              </span>
            </div>
          ))}
        </>
      )}
    </article>
  );
}

function OperatorDriversList({ drivers = [], onSelectDriver }) {
  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Association drivers</span>
        <span className="module-number">{drivers.length}</span>
      </div>
      {drivers.length === 0 && <p className="muted">No drivers are assigned to your association yet.</p>}
      {drivers.map((d) => (
        <button key={d.id} type="button" className="trip-row" onClick={() => onSelectDriver(d.id)}>
          <span>
            <strong>
              {d.user?.first_name || ''} {d.user?.last_name || ''} {(!d.user?.first_name && !d.user?.last_name) ? d.user?.username || 'Driver' : ''}
            </strong>
            <small>
              {d.user?.phone || 'No phone'} · license {d.license_number || '—'} · {d.status}
            </small>
          </span>
          <span className="status-pill" style={{ borderColor: d.status === 'verified' ? 'var(--success)' : 'var(--accent)', color: d.status === 'verified' ? 'var(--success)' : 'var(--accent)' }}>
            {d.status}
          </span>
        </button>
      ))}
    </article>
  );
}

function OperatorComplaintRow({ complaint, onResolve }) {
  return (
    <div className="trip-row" key={complaint.id}>
      <span>
        <strong>{complaint.category}</strong>
        <small>
          {complaint.driver_name || 'Driver'} · {complaint.trip_code || 'Trip'} · {complaint.status}
        </small>
        <small>{complaint.description}</small>
      </span>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onResolve?.(complaint.id, 'resolved')}
        disabled={complaint.status === 'resolved'}
      >
        {complaint.status === 'resolved' ? 'Resolved' : 'Resolve'}
      </button>
    </div>
  );
}

function OperatorComplaintsList({ complaints = [], onResolve }) {
  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Complaints</span>
        <span className="module-number">{complaints.length}</span>
      </div>
      {complaints.length === 0 && <p className="muted">No complaints recorded for your association.</p>}
      {complaints.map((complaint) => (
        <OperatorComplaintRow key={complaint.id} complaint={complaint} onResolve={onResolve} />
      ))}
    </article>
  );
}

function OperatorDriverDetail({ driverId, onBack }) {
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api.getOperatorDriver(driverId);
        if (!ignore) setDriver(data);
      } catch {
        if (!ignore) setDriver(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [driverId]);

  if (loading) {
    return (
      <article className="module module-wide">
        <p className="muted">Loading driver details…</p>
        <button type="button" className="secondary-button" onClick={onBack}>← Back</button>
      </article>
    );
  }

  if (!driver) {
    return (
      <article className="module module-wide">
        <p className="muted">Driver not found.</p>
        <button type="button" className="secondary-button" onClick={onBack}>← Back</button>
      </article>
    );
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>{driver.user?.first_name || 'Driver'} {driver.user?.last_name || ''}</span>
        <button type="button" className="secondary-button" onClick={onBack}>← Back</button>
      </div>

      <div className="route-summary">
        <div>
          <span className="route-label">Phone</span>
          <strong>{driver.user?.phone || '—'}</strong>
        </div>
        <div>
          <span className="route-label">Email</span>
          <strong>{driver.user?.email || '—'}</strong>
        </div>
        <div>
          <span className="route-label">License</span>
          <strong>{driver.license_number || '—'}</strong>
        </div>
        <div>
          <span className="route-label">ID</span>
          <strong>{driver.id_number || '—'}</strong>
        </div>
        <div>
          <span className="route-label">Status</span>
          <strong>{driver.status || '—'}</strong>
        </div>
        <div>
          <span className="route-label">Trips</span>
          <strong>{driver.trip_count || 0}</strong>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 18 }}>Recent trips</div>
      {(driver.recent_trips || []).length === 0 ? (
        <p className="muted">No trip history yet.</p>
      ) : (
        (driver.recent_trips || []).map((trip) => (
          <div className="trip-row" key={trip.id}>
            <span>
              <strong>{trip.trip_code}</strong>
              <small>
                {trip.route?.departure?.name || '—'} → {trip.route?.destination?.name || '—'} · {trip.departure_date} · {trip.status}
              </small>
            </span>
          </div>
        ))
      )}
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
  const [flagCategory, setFlagCategory] = useState('delay');
  const [flagDescription, setFlagDescription] = useState('');
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

  async function release() {
    try {
      await api.release(tripId);
      notify?.('Trip released.');
      await load();
    } catch (err) {
      notify?.(err.message || 'Could not release trip.');
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

  async function flagTrip() {
    if (!flagDescription.trim()) {
      notify?.('Please add a description for the trip issue.');
      return;
    }
    try {
      await api.flagTrip(tripId, {
        category: flagCategory,
        description: flagDescription,
      });
      notify?.('Trip issue flagged successfully.');
      setFlagDescription('');
      setFlagCategory('delay');
    } catch (err) {
      notify?.(err.message || 'Unable to flag trip.');
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
            Engage this trip to open boarding. While engaged you work this trip&apos;s manifest
            until you release it.
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
          <span>{trip.trip_code} · BOARDING</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="secondary-button" onClick={onBack} type="button">
              ← Back
            </button>
            <button className="danger-button" onClick={release} type="button">
              Release trip
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

      <article className="module module-wide">
        <div className="module-heading">
          <span>Trip incident flag</span>
        </div>
        <div className="form-grid" style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>
            Category
            <select value={flagCategory} onChange={(e) => setFlagCategory(e.target.value)}>
              <option value="safety">Safety</option>
              <option value="delay">Delay</option>
              <option value="misconduct">Misconduct</option>
              <option value="vehicle">Vehicle issue</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Description
            <textarea value={flagDescription} onChange={(e) => setFlagDescription(e.target.value)} rows={3} placeholder="Describe the issue requiring admin attention" />
          </label>
        </div>
        <button type="button" className="primary-button" onClick={flagTrip} style={{ marginTop: 12 }}>
          Flag this trip
        </button>
      </article>
    </>
  );
}
