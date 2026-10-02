import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmDeliveredBookings } from './autoBoarding.js';
const receipt = { id: 1, status: 'boarded', verification_code: 'RECEIPT', boarded_at: '2026-10-02T04:00:00Z', passenger_confirmed_at: null };

test('detects the issued code and submits it without passenger input', async () => {
  const calls = [];
  const result = await confirmDeliveredBookings([receipt], async (id, code) => { calls.push({ id, code }); return { ...receipt, passenger_confirmed_at: 'now' }; });
  assert.deepEqual(calls, [{ id: 1, code: 'RECEIPT' }]);
  assert.equal(result[0].passenger_confirmed_at, 'now');
});

test('retries automatically after a connection error', async () => {
  const pending = await confirmDeliveredBookings([receipt], async () => { throw new Error('offline'); });
  assert.equal(pending[0].passenger_confirmed_at, null);
  const connected = await confirmDeliveredBookings(pending, async () => ({ ...receipt, passenger_confirmed_at: 'now' }));
  assert.equal(connected[0].passenger_confirmed_at, 'now');
});

test('does not acknowledge reservations, cancelled receipts or already confirmed trips', async () => {
  const inputs = [{ ...receipt, status: 'reserved' }, { ...receipt, status: 'cancelled' }, { ...receipt, passenger_confirmed_at: 'done' }, { ...receipt, verification_code: null }];
  let count = 0;
  assert.deepEqual(await confirmDeliveredBookings(inputs, async () => { count++; }), inputs);
  assert.equal(count, 0);
});
