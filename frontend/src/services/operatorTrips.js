/** UI-only ordering/labels. Server determines the actual trip lifecycle. */
const ACTIVE = new Set(['boarding', 'in_progress']);
const FINISHED = new Set(['completed', 'cancelled', 'expired', 'flagged']);

export function operatorTripTime(trip) {
  if (!trip?.departure_date) return Number.POSITIVE_INFINITY;
  const raw = `${trip.departure_date}T${trip.expected_departure_time || '00:00:00'}`;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function selectOperatorPriorityTrip(trips = [], now = new Date()) {
  const nowMs = new Date(now).getTime();
  const candidates = (Array.isArray(trips) ? trips : []).filter(t => !FINISHED.has(t.status));
  // An operating trip wins even when a second assigned trip departs sooner.
  const operating = candidates.filter(t => ACTIVE.has(t.status));
  if (operating.length) {
    return [...operating].sort((a, b) =>
      (b.is_engaged ? 1 : 0) - (a.is_engaged ? 1 : 0) ||
      (b.status === 'in_progress' ? 1 : 0) - (a.status === 'in_progress' ? 1 : 0) ||
      operatorTripTime(a) - operatorTripTime(b) || a.id - b.id
    )[0];
  }
  const today = `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, '0')}-${String(new Date(now).getDate()).padStart(2, '0')}`;
  return candidates.filter(t => t.status === 'scheduled' && (
    operatorTripTime(t) >= nowMs || (!t.expected_departure_time && t.departure_date >= today)
  )).sort((a, b) => operatorTripTime(a) - operatorTripTime(b) || a.id - b.id)[0] || null;
}

export function operatorTripLabel(trip) {
  if (trip.status === 'cancelled' && trip.driver_location_status === 'no_show') {
    if (trip.refund_status === 'no_payment') return 'Driver No-Show — No Paid Bookings';
    return 'Refunded — Driver No-Show';
  }
  if (trip.status === 'flagged' || trip.status === 'expired') return 'Cancelled'; // legacy-only
  return trip.display_status || ({
    scheduled: 'Scheduled', boarding: 'Boarding', in_progress: 'In progress',
    completed: 'Completed', cancelled: 'Cancelled',
  }[trip.status] || 'Unknown');
}

export function groupOperatorTrips(trips = []) {
  const rows = Array.isArray(trips) ? trips : [];
  const sortEarly = (a, b) => operatorTripTime(a) - operatorTripTime(b) || a.id - b.id;
  const sortLate = (a, b) => operatorTripTime(b) - operatorTripTime(a) || b.id - a.id;
  return [
    { title: 'Currently operating', trips: rows.filter(t => ACTIVE.has(t.status)).sort(sortEarly) },
    { title: 'Upcoming', trips: rows.filter(t => t.status === 'scheduled').sort(sortEarly) },
    { title: 'Trip history', trips: rows.filter(t => FINISHED.has(t.status)).sort(sortLate) },
  ];
}
