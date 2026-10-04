import { useEffect, useState } from 'react';
import api from '../api';

export function apiMessage(err) {
  const data = err.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  if (data && typeof data === 'object') return Object.entries(data).map(([key, value]) => key.replaceAll('_', ' ') + ': ' + (Array.isArray(value) ? value.join(' ') : JSON.stringify(value))).join(' ');
  return 'Could not save. Check your connection and try again.';
}

export function TripHistory({ tripId, refresh = 0 }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get('/transport/api/trips/' + tripId + '/history/').then(({data}) => { if (active) {setRows(data); setError('');} })
      .catch(err => {if (active) setError(apiMessage(err));});
    return () => { active = false; };
  }, [tripId, refresh]);
  return <details className="trip-history"><summary>Change history · {rows.length}</summary>
    {error && <p role="alert">{error}</p>}
    {!error && !rows.length && <p className="muted">No changes recorded yet.</p>}
    {rows.map(row => <article className="audit-entry" key={row.id}>
      <strong>{row.actor_name} · {row.actor_role}</strong>
      <small>{new Date(row.changed_at).toLocaleString()}</small>
      <p className="audit-reason">{row.reason}</p>
      <dl>{Object.keys(row.after).filter(key => row.before[key] !== row.after[key]).map(key =>
        <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{row.before[key] ?? 'Unassigned'} → {row.after[key] ?? 'Unassigned'}</dd></div>)}</dl>
    </article>)}
  </details>;
}

export function TripEditor({ trip, admin = false, notify, onSaved }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState({drivers: [], vehicles: [], routes: [], operators: []});
  const [values, setValues] = useState({});
  const [baseline, setBaseline] = useState({});
  const [reason, setReason] = useState('');
  const [driverReason, setDriverReason] = useState('');
  const [vehicleReason, setVehicleReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const active = ['scheduled', 'boarding'].includes(trip.status);
  function begin() {
    const initial = {driver_id: String(trip.driver_id || ''), vehicle_id: String(trip.vehicle_id || ''),
      route_id: String(trip.route.id), operator_id: String(trip.operator_id),
      departure_date: trip.departure_date, expected_departure_time: trip.expected_departure_time?.slice(0, 5) || '',
      seat_capacity: String(trip.seat_capacity), notes: trip.notes || ''};
    setValues(initial); setBaseline(initial); setReason(''); setDriverReason(''); setVehicleReason('');
    setOpen(true); setError(''); setLoaded(false);
    Promise.all([api.get('/transport/api/trips/' + trip.id + '/edit-options/'),
      admin ? api.get('/transport/api/admin/available-for-rank/') : Promise.resolve({data: {}})])
      .then(([assets, rest]) => {setOptions({...rest.data, ...assets.data}); setLoaded(true);})
      .catch(err => setError(apiMessage(err)));
  }
  const driverChanged = values.driver_id !== baseline.driver_id;
  const vehicleChanged = values.vehicle_id !== baseline.vehicle_id;
  function field(key, value) {setValues(v => ({...v, [key]: value}));}
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    const payload = {reason};
    const keys = admin ? Object.keys(baseline) : ['driver_id', 'vehicle_id'];
    for (const key of keys) if (values[key] !== baseline[key]) {
      payload[key] = key.endsWith('_id') || key === 'seat_capacity' ? (values[key] ? Number(values[key]) : null) : values[key] || (key === 'expected_departure_time' ? null : '');
    }
    if (!admin && driverChanged) payload.driver_reason = driverReason;
    if (!admin && vehicleChanged) payload.vehicle_reason = vehicleReason;
    try {
      if (admin) await api.patch('/transport/api/admin/trips/' + trip.id + '/edit/', payload);
      else await api.post('/transport/api/my-trips/' + trip.id + '/reassign/', payload);
      setOpen(false); setRevision(n => n + 1); notify('Trip updated. Changes saved to the audit history.'); onSaved?.();
    } catch (err) {setError(apiMessage(err));}
    finally {setBusy(false);}
  }
  function select(key, title, rows, label, currentLabel) {
    return <label>{title}<select value={values[key] ?? ''} onChange={e => field(key, e.target.value)} disabled={busy || !active}>
      <option value="">Unassigned</option>
      {values[key] && !rows.some(row => String(row.id) === values[key]) && <option value={values[key]}>{currentLabel || 'Current assignment'}</option>}
      {rows.map(row => <option key={row.id} value={row.id}>{label(row)}</option>)}
    </select></label>;
  }
  return <section className="trip-tools">
    {(admin || active) && <button className="secondary-button" type="button" onClick={open ? () => setOpen(false) : begin}>{open ? 'Close editor' : admin ? 'Edit trip' : 'Change driver / vehicle'}</button>}
    {open && <form className="trip-edit-form" onSubmit={save}>
      <h3>{admin ? 'Edit scheduled trip' : 'Update assigned driver or vehicle'}</h3>
      <p className="muted">{admin ? 'Your name, reason and every changed value are retained in the trip history.' : 'Only approved rank drivers and roadworthy vehicles can be selected. A changed assignment needs a fresh on-site check.'}</p>
      {active && <div className="form-grid">
        {select('driver_id', 'Approved driver', options.drivers, d => d.name, trip.driver_name)}
        {select('vehicle_id', 'Vehicle', options.vehicles, v => v.plate_number + ' · ' + v.seat_capacity + ' seats', trip.vehicle_plate)}
        {admin && <>
          {select('route_id', 'Route', options.routes || [], r => r.departure.name + ' → ' + r.destination.name, trip.route.departure.name + ' → ' + trip.route.destination.name)}
          {select('operator_id', 'Operator', options.operators || [], o => o.name, trip.operator_name)}
          <label>Date<input type="date" required value={values.departure_date || ''} onChange={e => field('departure_date', e.target.value)} /></label>
          <label>Departure time<input type="time" value={values.expected_departure_time || ''} onChange={e => field('expected_departure_time', e.target.value)} /></label>
          <label>Seat capacity<input type="number" min={Math.max(1, trip.seats_taken)} max="100" required value={values.seat_capacity || ''} onChange={e => field('seat_capacity', e.target.value)} /></label>
        </>}
      </div>}
      {admin && <label>Trip notes<textarea value={values.notes || ''} maxLength={4000} onChange={e => field('notes', e.target.value)} /></label>}
      <label>Reason for this edit<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {!admin && driverChanged && <label>Reason for changing the driver<textarea required maxLength={1000} value={driverReason} onChange={e => setDriverReason(e.target.value)} /></label>}
      {!admin && vehicleChanged && <label>Reason for changing the vehicle<textarea required maxLength={1000} value={vehicleReason} onChange={e => setVehicleReason(e.target.value)} /></label>}
      {error && <p className="asset-verification-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy || !loaded} type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
    </form>}
    <TripHistory tripId={trip.id} refresh={revision} />
  </section>;
}

export function TripGroupEditor({ trip, notify, onSaved }) {
  const rows = [...(trip.booked_passengers || []), ...(trip.walk_in_passengers || [])].filter(b => ['reserved', 'boarded'].includes(b.status));
  const [leaderId, setLeaderId] = useState('');
  const [selected, setSelected] = useState([]);
  const [companions, setCompanions] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const leader = rows.find(b => b.booking_id === Number(leaderId));
  function choose(id) {
    const b = rows.find(row => row.booking_id === Number(id));
    setLeaderId(id); setSelected([]); setName(b?.next_of_kin_name || ''); setPhone(b?.next_of_kin_phone || '');
    setConfirmed(false); setError('');
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.post('/transport/api/my-trips/' + trip.id + '/group/', {leader_id: Number(leaderId), booking_ids: selected,
        companions, next_of_kin_name: name, next_of_kin_phone: phone});
      notify('Family / travel group saved for this trip.'); setCompanions([]); setSelected([]); setConfirmed(false); onSaved();
    } catch (err) {setError(apiMessage(err));}
    finally {setBusy(false);}
  }
  if (!['scheduled', 'boarding'].includes(trip.status)) return null;
  return <article className="module module-wide">
    <details><summary>Family & travel groups</summary>
      <p className="muted">Group people already booked on this trip, or add children and other companions. Everyone shares one emergency contact for this journey. Their account profiles stay unchanged.</p>
      <form onSubmit={submit}>
        <label>Lead passenger<select required value={leaderId} onChange={e => choose(e.target.value)}><option value="">Choose a booked passenger or walk-in</option>{rows.filter(b => !b.group_leader_id).map(b => <option key={b.booking_id} value={b.booking_id}>{b.name}</option>)}</select></label>
        {leader && <>
          <fieldset><legend>Other passengers already on this trip</legend>
            {rows.filter(b => b.booking_id !== leader.booking_id && (!b.group_leader_id || b.group_leader_id === leader.booking_id) && (!b.group_size || b.group_size === 1)).map(b =>
              <label className="checkbox-row" key={b.booking_id}><input type="checkbox" checked={b.group_leader_id === leader.booking_id || selected.includes(b.booking_id)} disabled={b.group_leader_id === leader.booking_id || busy}
                onChange={e => setSelected(ids => e.target.checked ? [...ids, b.booking_id] : ids.filter(id => id !== b.booking_id))} />{b.name}{b.group_leader_id === leader.booking_id ? ' · already in group' : ''}</label>)}
          </fieldset>
          {companions.map((c, i) => <div className="companion-row" key={i}>
            <label>First name<input required maxLength={150} value={c.first_name} onChange={e => setCompanions(cs => cs.map((x, n) => n === i ? {...x, first_name: e.target.value} : x))} /></label>
            <label>Surname<input required maxLength={150} value={c.last_name} onChange={e => setCompanions(cs => cs.map((x, n) => n === i ? {...x, last_name: e.target.value} : x))} /></label>
            <button type="button" className="text-button" onClick={() => setCompanions(cs => cs.filter((_, n) => n !== i))}>Remove</button>
          </div>)}
          <button type="button" className="secondary-button" disabled={busy || companions.length >= trip.seats_available} onClick={() => setCompanions(cs => [...cs, {first_name: '', last_name: ''}])}>Add child / companion</button>
          <p className="muted">New companions reserve a seat. Select them for boarding only when they are physically present.</p>
          <div className="form-grid"><label>Shared next-of-kin name<input required maxLength={150} value={name} onChange={e => setName(e.target.value)} /></label><label>Shared next-of-kin phone<input type="tel" required maxLength={15} value={phone} onChange={e => setPhone(e.target.value)} /></label></div>
          <label className="checkbox-row"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />The adult passengers / guardian have confirmed this shared emergency contact.</label>
          <button className="primary-button" disabled={busy || !confirmed} type="submit">{busy ? 'Saving…' : 'Save trip group'}</button>
        </>}
        {error && <p role="alert" className="asset-verification-error">{error}</p>}
      </form>
    </details>
  </article>;
}
