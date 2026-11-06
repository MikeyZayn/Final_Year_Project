import assert from 'node:assert/strict';
import test from 'node:test';
import { selectOperatorPriorityTrip, operatorTripLabel, groupOperatorTrips } from './operatorTrips.js';

const trip = (id, status, date, time='10:00:00', extra={}) => ({
  id, status, departure_date: date, expected_departure_time: time, ...extra,
});

test('current engaged boarding trip outranks earlier upcoming scheduled trip', () => {
  const a=trip(1,'scheduled','2026-11-10','08:00:00');
  const b=trip(2,'boarding','2026-11-10','12:00:00',{is_engaged:true});
  assert.equal(selectOperatorPriorityTrip([a,b],new Date('2026-11-09')).id,2);
});

test('engaged in-progress trip wins until finalised', () => {
  const a=trip(1,'in_progress','2026-11-07','07:00:00',{is_engaged:true});
  const b=trip(2,'scheduled','2026-11-07','08:00:00');
  assert.equal(selectOperatorPriorityTrip([a,b],new Date('2026-11-07T07:30:00')).id,1);
  assert.equal(selectOperatorPriorityTrip([{...a,status:'completed',is_engaged:false},b],new Date('2026-11-07T07:30:00')).id,2);
});

test('no completed or cancelled trip is selected as current', () => {
  assert.equal(selectOperatorPriorityTrip([trip(1,'completed','2026-11-06'),trip(2,'cancelled','2026-11-05')]),null);
});

test('refund status is different from general cancellation', () => {
  assert.equal(operatorTripLabel(trip(1,'cancelled','2026-11-01','10:00',{driver_location_status:'no_show'})), 'Refunded — Driver No-Show');
  assert.equal(operatorTripLabel(trip(1,'cancelled','2026-11-01','10:00',{driver_location_status:'no_show',refund_status:'no_payment'})), 'Driver No-Show — No Paid Bookings');
  assert.equal(operatorTripLabel(trip(2,'cancelled','2026-11-01')), 'Cancelled');
  assert.equal(operatorTripLabel(trip(3,'completed','2026-11-01')), 'Completed');
  assert.equal(operatorTripLabel(trip(4,'flagged','2026-11-01')), 'Cancelled');
});

test('all assigned trips include operating, upcoming and history', () => {
  const rows=[trip(1,'completed','2026-11-01'), trip(2,'scheduled','2026-11-09'),trip(3,'cancelled','2026-11-07'),trip(4,'in_progress','2026-11-08')];
  assert.deepEqual(groupOperatorTrips(rows).map(x=>x.trips.map(t=>t.id)),[[4],[2],[3,1]]);
});

test("today's untimed assigned trip remains visible if it is the only trip", () => {
  const today=trip(1,'scheduled','2026-11-06',null);
  assert.equal(selectOperatorPriorityTrip([today],new Date('2026-11-06T14:00:00')).id,1);
});
