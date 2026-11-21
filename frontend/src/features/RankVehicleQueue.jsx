import { useEffect, useState } from 'react';
import api from '../api';

export default function RankVehicleQueue({ editable = false }) {
  const path = editable ? '/transport/api/admin/queue/' : '/transport/api/operator/queue/';
  const [entries, setEntries] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get(path);
      setEntries(data);
      if (editable) {
        const { data: options } = await api.get('/transport/api/admin/available-for-rank/');
        setVehicles(options.vehicles);
      }
    } catch {
      setError('Could not load the vehicle queue.');
    }
  }

  useEffect(() => { load(); }, [path]);

  async function change(endpoint, data) {
    setError('');
    setBusy(true);
    try {
      await api.post(endpoint, data);
      setVehicleId('');
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update the queue.');
    } finally {
      setBusy(false);
    }
  }

  return <article className="module module-wide">
    <h3>Waiting vehicles</h3>
    {error && <p role="alert">{error}</p>}
    {!entries.length && <p className="muted">No vehicles in the queue.</p>}
    {entries.map((entry, index) => <div className="trip-row" key={entry.id}>
      <span><strong>{entry.position}. {entry.plate_number}</strong>
        <small>{[entry.rank_name, entry.vehicle_label].filter(Boolean).join(' · ')}</small></span>
      {editable && <div className="pb-actions">
        <button type="button" className="secondary-button" disabled={busy || index === 0}
          onClick={() => change(`${path}${entry.id}/move/`, { direction: 'up' })}>Move up</button>
        <button type="button" className="secondary-button" disabled={busy || index === entries.length - 1}
          onClick={() => change(`${path}${entry.id}/move/`, { direction: 'down' })}>Move down</button>
        <button type="button" className="text-button" disabled={busy}
          onClick={() => change(`${path}${entry.id}/remove/`)}>Remove</button>
      </div>}
    </div>)}
    {editable && <form onSubmit={event => { event.preventDefault(); change(path, { vehicle_id: Number(vehicleId) }); }}>
      <label>Vehicle<select value={vehicleId} onChange={e => setVehicleId(e.target.value)} required>
        <option value="">Choose a vehicle</option>
        {vehicles.filter(vehicle => !entries.some(entry => entry.vehicle_id === vehicle.id))
          .map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number}</option>)}
      </select></label>
      <button type="submit" className="primary-button" disabled={busy || !vehicleId}>Add to queue</button>
    </form>}
    {!editable && <button type="button" className="text-button" onClick={load}>Refresh queue</button>}
  </article>;
}
