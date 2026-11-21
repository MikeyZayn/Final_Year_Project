import { useEffect, useState } from 'react';
import api from '../api';

export default function CommuterPassUsage() {
  const [uses, setUses] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/transport/api/admin/commuter-pass-usage/')
      .then(({ data }) => { if (active) setUses(data); })
      .catch(() => { if (active) setError('Could not load commuter pass usage.'); });
    return () => { active = false; };
  }, []);

  return <article className="module module-wide">
    <h3>Commuter pass usage</h3>
    {error && <p role="alert">{error}</p>}
    {!uses && !error && <p role="status">Loading usage…</p>}
    {uses?.length === 0 && <p>No passes have been recorded at this rank.</p>}
    {uses?.map(usage => <div className="trip-row" key={usage.id}>
      <span><strong>{usage.trip_code}</strong><small>Booking {usage.booking_id} · {usage.operator_name || 'Rank operator'}</small></span>
      <time dateTime={usage.recorded_at}>{new Date(usage.recorded_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</time>
    </div>)}
  </article>;
}
