import { useEffect, useState } from 'react';
import api from '../api';

export function DriverRankMemberships({ notify }) {
  const [memberships, setMemberships] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [rankId, setRankId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [m, r] = await Promise.all([api.get('/transport/api/driver/memberships/'), api.get('/transport/api/ranks/')]);
      setMemberships(m.data); setRanks(r.data); setError('');
    } catch (err) { setError(err.response?.data?.detail || 'Could not load rank memberships.'); }
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const available = ranks.filter(r => !memberships.some(m => m.rank.id === r.id && ['active', 'pending'].includes(m.status)));
  async function request(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api.post('/transport/api/driver/memberships/', { rank_id: Number(rankId), notes });
      notify('Rank request submitted for admin approval.'); setRankId(''); setNotes(''); await load();
    } catch (err) { setError(err.response?.data?.detail || 'Could not request rank.'); }
    finally { setBusy(false); }
  }
  return <article className="module module-wide">
    <div className="module-heading"><span>My driver ranks</span><span className="module-number">Approval required</span></div>
    <p className="muted">Request access to another rank. Its admin approves before you can be assigned there. Your existing approved ranks remain available.</p>
    {!memberships.length && <p className="muted">No ranks yet. Choose your first rank below.</p>}
    {memberships.map(m => <div className="trip-row" key={m.id}><span><strong>{m.rank.name}</strong><small>{m.rank.area}</small></span><span className="status-pill">{m.status}</span></div>)}
    <form onSubmit={request}>
      <div className="form-grid">
        <label>New rank<select required value={rankId} onChange={e => setRankId(e.target.value)}><option value="">Choose a rank</option>{available.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Reason (optional)<input maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" disabled={busy || !rankId} type="submit">{busy ? 'Submitting…' : 'Request rank access'}</button>
    </form>
  </article>;
}

export function AdminDriverRankRequests({ notify }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  async function load() {
    try { const { data } = await api.get('/transport/api/admin/driver-memberships/'); setItems(data); setError(''); }
    catch (err) { setError(err.response?.data?.detail || 'Could not load driver applications.'); }
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  async function decide(m, action) {
    let notes = '';
    if (action === 'reject') { notes = window.prompt('Reason for rejection (optional):'); if (notes === null) return; }
    setBusy(m.id);
    try { await api.post(`/transport/api/admin/driver-memberships/${m.id}/${action}/`, { notes }); notify(`Driver request ${action === 'approve' ? 'approved' : 'rejected'}.`); await load(); }
    catch (err) { setError(err.response?.data?.detail || 'Could not review request.'); }
    finally { setBusy(null); }
  }
  return <article className="module module-wide">
    <div className="module-heading"><span>Driver rank applications</span><span className="module-number">{items.length}</span></div>
    {error && <p role="alert">{error}</p>}
    {!items.length && <p className="muted">No pending driver requests.</p>}
    {items.map(m => <div className="trip-row" key={m.id}>
      <span><strong>{m.driver_name}</strong><small>{m.phone} · Licence {m.license_number} · {m.driver_status}</small><small>{m.rank.name} · {m.notes || 'No reason supplied'}</small></span>
      <div style={{ display: 'flex', gap: 8 }}><button className="primary-button" disabled={busy !== null} onClick={() => decide(m, 'approve')}>Approve</button><button className="danger-button" disabled={busy !== null} onClick={() => decide(m, 'reject')}>Reject</button></div>
    </div>)}
  </article>;
}

export function GroupBookingModal({ trip, busy, onClose, onSubmit }) {
  const [companions, setCompanions] = useState([]);
  const [error, setError] = useState('');
  const available = Math.max(0, (trip?.seats_available ?? 1) - 1);
  function submit(e) {
    e.preventDefault();
    if (companions.some(c => !c.first_name.trim() || !c.last_name.trim())) { setError('Enter a name and surname for each companion.'); return; }
    onSubmit(companions.map(c => ({ first_name: c.first_name.trim(), last_name: c.last_name.trim() })));
  }
  return <div className="settings-overlay"><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="group-title">
    <div className="settings-header"><h3 id="group-title">Book for yourself or your group</h3><button className="text-button" disabled={busy} onClick={onClose}>Close</button></div>
    <p className="muted">{trip?.route?.departure?.name} → {trip?.route?.destination?.name}</p>
    <p>Add companions who do not have THEMBA. We record only their name and surname, link them to this trip, and use your saved next-of-kin details for the group. Each person uses one seat.</p>
    <form onSubmit={submit}>
      {companions.map((c, i) => <div className="settings-section" key={i}>
        <div className="form-grid"><label>Name<input required maxLength={150} value={c.first_name} onChange={e => setCompanions(cs => cs.map((x, n) => n === i ? { ...x, first_name: e.target.value } : x))} /></label><label>Surname<input required maxLength={150} value={c.last_name} onChange={e => setCompanions(cs => cs.map((x, n) => n === i ? { ...x, last_name: e.target.value } : x))} /></label></div>
        <button className="text-button" type="button" disabled={busy} onClick={() => setCompanions(cs => cs.filter((_, n) => n !== i))}>Remove companion {i + 1}</button>
      </div>)}
      <button className="secondary-button" type="button" disabled={busy || companions.length >= available} onClick={() => setCompanions(cs => [...cs, { first_name: '', last_name: '' }])}>Add companion</button>
      {error && <p role="alert">{error}</p>}
      <div className="settings-actions"><button className="secondary-button" disabled={busy} type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Booking…' : `Book ${1 + companions.length} seat${companions.length ? 's' : ''}`}</button></div>
    </form>
  </section></div>;
}

export function GroupBoarding({ trip, leader, notify, onBoarded }) {
  const group = [leader, ...[...(trip.booked_passengers || []), ...(trip.walk_in_passengers || [])].filter(b => b.group_leader_id === leader.booking_id)];
  const reserved = group.filter(b => b.status === 'reserved');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  async function board() {
    setBusy(true);
    try {
      const { data } = await api.post(`/transport/api/my-trips/${trip.id}/bookings/${leader.booking_id}/board-group/`, { booking_ids: selected });
      notify(`${data.boarded_count} group passenger(s) boarded.`); setSelected([]); onBoarded();
    } catch (err) { notify(err.response?.data?.detail || 'Could not board group.'); }
    finally { setBusy(false); }
  }
  if (group.length < 2 || !reserved.length) return null;
  return <div className="settings-section">
    <strong>Travelling with {leader.name}</strong><p className="muted">Select only the people physically present. One shared next of kin: {leader.next_of_kin_name} · {leader.next_of_kin_phone}.</p>
    {reserved.map(b => <label className="checkbox-row" key={b.booking_id}><input type="checkbox" checked={selected.includes(b.booking_id)} disabled={busy} onChange={e => setSelected(ids => e.target.checked ? [...ids, b.booking_id] : ids.filter(id => id !== b.booking_id))} />{b.name}</label>)}
    <button className="primary-button" disabled={busy || !selected.length || !trip.assets_verified_at || trip.status !== 'boarding'} onClick={board}>{busy ? 'Boarding…' : `Board ${selected.length} present group member(s)`}</button>
  </div>;
}

export function DepartureQueue() {
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState('');
  async function load() {
    try { const { data } = await api.get('/transport/api/admin/rank-trips/'); setTrips(data.filter(t => ['scheduled', 'boarding'].includes(t.status))); setError(''); }
    catch (err) { setError(err.response?.data?.detail || 'Could not load departure queue.'); }
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  return <article className="module module-wide">
    <div className="module-heading"><span>Departure queue</span><span className="module-number">{trips.length}</span></div>
    <p className="muted">Unstarted departures expire after 24 hours in their departure queue. Future trips are protected until their scheduled time; boarded and travelling passengers stay active. Expired trips remain in trip history.</p>
    <button className="text-button" type="button" onClick={load}>Refresh queue</button>
    {error && <p role="alert">{error}</p>}
    {!trips.length && !error && <p className="muted">No waiting departures.</p>}
    {trips.map(t => <div className="trip-row" key={t.id}><span><strong>{t.trip_code} · {t.route.departure.name} → {t.route.destination.name}</strong><small>{t.departure_date} · {t.expected_departure_time || 'No set time'} · {t.seats_taken}/{t.seat_capacity} seats</small><small>Queue expiry: {new Date(t.queue_expires_at).toLocaleString()} · {t.status === 'boarding' && t.seats_taken > 0 ? 'Boarding in progress' : 'Waiting'}</small></span><span className="status-pill">{t.status}</span></div>)}
  </article>;
}
