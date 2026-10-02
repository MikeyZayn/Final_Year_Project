import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { nearestRank } from '../services/nearbyRanks';

export default function QuickBooking({ trips, bookings, busy, onBook, onGroup, onRouteChange, onSignIn, signedIn }) {
  const [ranks, setRanks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [rankId, setRankId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [position, setPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState('Finding your starting point…');
  const [error, setError] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const mounted = useRef(true);
  const requested = useRef(false);
  const manual = useRef(false);
  const callback = useRef(onRouteChange);
  callback.current = onRouteChange;

  function locate() {
    manual.current = false;
    if (!navigator.geolocation) { setLocationStatus('Choose a starting rank below. Location is unavailable on this device.'); return; }
    setLocationStatus('Allow location to suggest your nearest rank…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { if (mounted.current) { setPosition({ latitude: coords.latitude, longitude: coords.longitude }); setLocationStatus('Finding a nearby taxi rank…'); } },
      err => { if (mounted.current) setLocationStatus(err.code === 1 ? 'Location access declined. Choose your starting rank below.' : 'Could not find your location. Choose a rank or try again.'); },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 },
    );
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    Promise.all([api.get('/transport/api/ranks/'), api.get('/transport/api/routes/')])
      .then(([rankRes, routeRes]) => { if (!cancelled) { setRanks(rankRes.data); setRoutes(routeRes.data); setError(''); } })
      .catch(() => { if (!cancelled) setError('Could not load ranks. Refresh to try again.'); })
      .finally(() => { if (!cancelled) setLoadingOptions(false); });
    if (!requested.current) { requested.current = true; locate(); }
    return () => { cancelled = true; mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!position || !ranks.length || manual.current) return;
    const servedIds = new Set(routes.filter(r => r.active !== false).map(r => r.departure.id));
    const nearby = nearestRank(ranks.filter(r => servedIds.has(r.id)), position);
    if (nearby) { setRankId(String(nearby.rank.id)); setLocationStatus(`Nearest rank suggested · ${nearby.distance.toFixed(1)} km away. You can change it.`); }
    else setLocationStatus('No served rank found within 25 km. Choose a starting rank below.');
  }, [position, ranks, routes]);
  useEffect(() => { if (rankId) callback.current?.(Number(rankId), destinationId ? Number(destinationId) : null); }, [rankId, destinationId]);
  const destinations = [...new Map(routes.filter(r => r.active !== false && r.departure.id === Number(rankId)).map(r => [r.destination.id, r.destination])).values()].sort((a,b) => a.name.localeCompare(b.name));
  const matches = trips.filter(t => t.route.departure.id === Number(rankId) && t.route.destination.id === Number(destinationId) && t.seats_available > 0 && !bookings.some(b => b.trip === t.id && !['cancelled','no_show'].includes(b.status)));
  const next = matches[0];
  const existing = bookings.find(b => b.trip === next?.id && !['cancelled','no_show'].includes(b.status));
  return <section className="quick-booking module module-wide" aria-label="Quick trip booking">
    <div className="quick-heading"><div><span className="eyebrow">YOUR NEXT JOURNEY</span><h2>Where are you going?</h2><p>Choose your destination. Your starting rank is suggested from your location.</p></div><span className="quick-icon" aria-hidden="true">↗</span></div>
    <div className="journey-fields">
      <label className="journey-field"><span className="location-dot" aria-hidden="true" /><span className="field-copy">Starting rank<select aria-label="Starting rank" value={rankId} disabled={loadingOptions} onChange={e => { manual.current = true; setRankId(e.target.value); setDestinationId(''); setLocationStatus('Starting rank selected by you.'); }}><option value="">Choose a rank</option>{ranks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></span></label>
      <label className="journey-field"><span className="destination-square" aria-hidden="true" /><span className="field-copy">Destination<select aria-label="Destination" value={destinationId} disabled={!rankId || loadingOptions} onChange={e => setDestinationId(e.target.value)}><option value="">Where to?</option>{destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></span></label>
    </div>
    <div className="location-status"><p role="status">{locationStatus}</p><button className="text-button" type="button" onClick={locate}>Use my location</button></div>
    {error && <p role="alert">{error}</p>}
    {!signedIn && <p className="muted">Explore trips now. <button className="text-button" type="button" onClick={onSignIn}>Sign in to book</button></p>}
    {rankId && !destinations.length && !loadingOptions && <p className="muted">No routes currently serve this rank. Choose another starting rank.</p>}
    {destinationId && !next && !busy && <p className="muted">No available departures for this journey. Choose another destination or check your bookings below.</p>}
    {next && <div className="quick-trip">
      <div className="taxi-glyph" aria-hidden="true">▰</div><div className="quick-trip-copy"><strong>Minibus taxi</strong><small>{next.route.departure.name} → {next.route.destination.name}</small><small>{next.departure_date} · {next.expected_departure_time?.slice(0,5) || 'Boarding at rank'} · {next.seats_available} seats available</small></div><div className="quick-fare"><strong>R{Number(next.route.fare || 0).toFixed(2)}</strong><small>per person</small></div>
      <div className="quick-trip-actions"><button className="primary-button" disabled={busy !== null || !!existing} type="button" onClick={() => signedIn ? onBook(next.id, []) : onSignIn()}>{busy === next.id ? 'Booking your seat…' : signedIn ? 'Book this taxi →' : 'Sign in & book →'}</button><button className="text-button" disabled={busy !== null} type="button" onClick={() => signedIn ? onGroup(next.id) : onSignIn()}>Travelling with others?</button></div>
    </div>}
    <div className="booking-reassurance"><span>✓ One seat, one tap</span><span>✓ Boarding code verified automatically</span></div>
  </section>;
}
