import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:5173', pretendToBeVisual: true });
for (const key of ['window', 'document', 'localStorage', 'sessionStorage', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const root = createRoot(document.getElementById('root'));
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(text));
async function click(text) { const target = button(text); assert.ok(target, `Missing button ${text}`); await act(async () => target.click()); await flush(); }
async function input(element, value) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); });
}
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
const trip = { id: 7, trip_code: 'UI-7', departure_date: today, seats_available: 3, seats_taken: 0, seat_capacity: 3, status: 'scheduled', operator_name: 'Test operator', route: { departure: { id: 1, name: 'Rank', latitude: -28.8, longitude: 31.9 }, destination: { id: 2, name: 'Town', latitude: -28.7, longitude: 32 } } };
let bookings = [{ id: 11, trip: 7, route_label: 'Rank → Town', trip_code: 'UI-7', departure_date: today, status: 'reserved', boarded_at: null, verification_code: null, passenger_confirmed_at: null, companions: [] }];
const calls = [];
let postedCompanions = null;
try {
  const { default: api } = await server.ssrLoadModule('/src/api.js');
  api.defaults.adapter = async config => {
    calls.push({ url: config.url, method: config.method, data: config.data });
    let data = [];
    if (config.url === '/accounts/api/me/') data = { id: 1, role: 'passenger', phone: '0821111111', first_name: 'Test' };
    else if (config.url === '/accounts/api/login/') data = { token: 'test-session', user: { id: 1, role: 'passenger', phone: '0821111111', first_name: 'Test' } };
    else if (config.url.startsWith('/transport/api/trips/')) data = [trip];
    else if (config.url === '/transport/api/my-bookings/') data = bookings.map(b => ({ ...b }));
    else if (config.url.endsWith('/confirm-boarding/')) {
      const payload = JSON.parse(config.data);
      assert.equal(payload.code, 'AUTO-CODE');
      bookings = bookings.map(b => ({ ...b, passenger_confirmed_at: new Date().toISOString() }));
      data = bookings[0];
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  const { default: App } = await server.ssrLoadModule('/src/App.jsx');
  const { AuthProvider } = await server.ssrLoadModule('/src/auth.jsx');
  await act(async () => root.render(React.createElement(AuthProvider, null, React.createElement(App))));
  await click('Sign in');
  await input(document.querySelector('input[autocomplete="tel"]'), '0821111111');
  await input(document.querySelector('input[type="password"]'), 'Passw0rd!');
  await click('Sign in');
  assert.match(document.body.textContent, /Your journeys/);
  bookings = bookings.map(b => ({ ...b, status: 'boarded', boarded_at: new Date().toISOString(), verification_code: 'AUTO-CODE' }));
  // Receipt arrives after the passenger has already opened the dashboard.
  await act(async () => window.dispatchEvent(new Event('focus')));
  await flush();
  assert.match(document.body.textContent, /Trip verified automatically/);
  assert.equal(calls.filter(c => c.url.endsWith('/confirm-boarding/')).length, 1);
  assert.ok(![...document.querySelectorAll('button')].some(b => b.textContent.includes('Verify trip')));
  console.log('PASS: rendered passenger dashboard detects and confirms an arriving receipt automatically.');

  const { default: QuickBooking } = await server.ssrLoadModule('/src/features/QuickBooking.jsx');
  const { DrawerTile } = await server.ssrLoadModule('/src/features/Drawer.jsx');
  const ranks = [trip.route.departure, trip.route.destination];
  api.defaults.adapter = async config => ({ data: config.url.endsWith('/ranks/') ? ranks : [{...trip.route, active:true}], status:200, statusText:'OK', headers:{}, config });
  Object.defineProperty(navigator, 'geolocation', { configurable:true, value:{ getCurrentPosition(success) { success({coords:{latitude:-28.8,longitude:31.9}}); } } });
  let quickBooking;
  await act(async () => root.render(React.createElement(QuickBooking, {trips:[trip],bookings:[],busy:null,signedIn:true,onBook:(id,companions)=>{quickBooking={id,companions};}})));
  await flush();
  assert.equal(document.querySelector('select[aria-label="Starting rank"]').value, '1');
  const selectSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  await act(async()=>{const el=document.querySelector('select[aria-label="Destination"]');selectSetter.call(el,'2');el.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('Book this taxi');
  assert.deepEqual(quickBooking,{id:7,companions:[]});
  console.log('PASS: geolocation preselects start; selecting a destination enables one-tap solo booking.');
  await act(async()=>root.render(React.createElement('div')));
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success,failure){failure({code:1});}}});
  await act(async()=>root.render(React.createElement(QuickBooking,{trips:[trip],bookings:[],busy:null,signedIn:true})));
  await flush();
  assert.match(document.body.textContent,/Location access declined/);
  await act(async()=>{const el=document.querySelector('select[aria-label="Starting rank"]');selectSetter.call(el,'1');el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(document.querySelector('select[aria-label="Destination"]').disabled,false);
  console.log('PASS: denied location leaves a working manual starting-rank choice.');
  await act(async()=>root.render(React.createElement(DrawerTile,{title:'Accounts',description:'Manage people'},React.createElement('p',null,'Drawer records'))));
  assert.equal(document.querySelector('[role="dialog"]'),null);
  await act(async()=>document.querySelector('.drawer-tile').click());assert.match(document.querySelector('[role="dialog"]').textContent,/Drawer records/);
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('[role="dialog"]'),null);
  console.log('PASS: drawer hides records until opened and closes with Escape.');

  const { GroupBookingModal, DriverRankMemberships, GroupBoarding } = await server.ssrLoadModule('/src/features/TripFeatures.jsx');
  await act(async () => root.render(React.createElement(GroupBookingModal, { trip, busy: false, onClose() {}, onSubmit: c => { postedCompanions = c; } })));
  await click('Add companion');
  const fields = document.querySelectorAll('input');
  await input(fields[0], 'Nandi'); await input(fields[1], 'Dube');
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.deepEqual(postedCompanions, [{ first_name: 'Nandi', last_name: 'Dube' }]);
  console.log('PASS: group booking modal captures only companion name and surname.');

  api.defaults.adapter = async config => ({ data: config.url.includes('/ranks/') ? [{ id: 1, name: 'New rank' }] : [], status: 200, statusText: 'OK', headers: {}, config });
  await act(async () => root.render(React.createElement(DriverRankMemberships, { notify() {} })));
  await flush();
  assert.match(document.body.textContent, /My driver ranks/);
  assert.match(document.body.textContent, /New rank/);
  console.log('PASS: driver rank request UI renders.');

  const leader = { booking_id: 11, name: 'Leader', status: 'reserved', next_of_kin_name: 'Family', next_of_kin_phone: '0822222222' };
  const groupTrip = { ...trip, assets_verified_at: new Date().toISOString(), status: 'boarding', walk_in_passengers: [{ booking_id: 12, group_leader_id: 11, name: 'Nandi Dube', status: 'reserved' }] };
  await act(async () => root.render(React.createElement(GroupBoarding, { trip: groupTrip, leader, notify() {}, onBoarded() {} })));
  assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 2);
  assert.equal(button('Board 0').disabled, true);
  await act(async () => document.querySelector('input[type="checkbox"]').click());
  assert.equal(button('Board 1').disabled, false);
  console.log('PASS: operator must select present group members before boarding.');

  const {TripEditor, TripGroupEditor} = await server.ssrLoadModule('/src/features/TripManagement.jsx');
  let editPayload = null;
  let groupPayload = null;
  api.defaults.adapter = async config => {
    let data = [];
    if (config.url.endsWith('/edit-options/')) data = {drivers: [{id: 1, name: 'Current driver'}, {id: 2, name: 'Approved replacement'}], vehicles: [{id: 1, plate_number: 'ABC', seat_capacity: 15}]};
    if (config.url.endsWith('/reassign/')) editPayload = JSON.parse(config.data);
    if (config.url.endsWith('/group/')) groupPayload = JSON.parse(config.data);
    return {data, status: 200, statusText: 'OK', headers: {}, config};
  };
  const editTrip = {...trip, driver_id: 1, vehicle_id: 1, operator_id: 1, status: 'boarding', route: {...trip.route, id: 1}, driver_name: 'Current driver'};
  await act(async () => root.render(React.createElement(TripEditor, {trip: editTrip, notify() {}, onSaved() {}})));
  await click('Change driver / vehicle');
  const driverSelect = document.querySelector('select');
  await act(async () => {selectSetter.call(driverSelect, '2'); driverSelect.dispatchEvent(new Event('change', {bubbles: true}));});
  assert.equal(document.querySelector('input[type=date]'), null, 'Operators must not see schedule controls');
  const textSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  for (const [i, el] of [...document.querySelectorAll('textarea')].entries()) {
    await act(async () => {textSetter.call(el, i ? 'Driver unavailable' : 'Shift adjustment'); el.dispatchEvent(new Event('input', {bubbles:true}));});
  }
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})));
  await flush();
  assert.deepEqual(editPayload, {reason: 'Shift adjustment', driver_id: 2, driver_reason: 'Driver unavailable'});
  console.log('PASS: operator editor sends only changed assets and explicit reasons.');

  const registered = {booking_id: 13, name: 'Registered sibling', status: 'reserved', group_size: 1};
  const familyTrip = {...editTrip, seats_available: 5, booked_passengers: [leader, registered], walk_in_passengers: []};
  await act(async () => root.render(React.createElement(TripGroupEditor, {trip: familyTrip, notify() {}, onSaved() {}})));
  const leadSelect = document.querySelector('select');
  await act(async () => {selectSetter.call(leadSelect, '11'); leadSelect.dispatchEvent(new Event('change', {bubbles:true}));});
  await act(async () => document.querySelector('fieldset input').click());
  await click('Add child / companion');
  const companionFields = document.querySelectorAll('.companion-row input');
  await input(companionFields[0], 'Child'); await input(companionFields[1], 'Family');
  const consent = [...document.querySelectorAll('input[type=checkbox]')].at(-1);
  await act(async () => consent.click());
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})));
  await flush();
  assert.equal(groupPayload.leader_id, 11);
  assert.deepEqual(groupPayload.booking_ids, [13]);
  assert.deepEqual(groupPayload.companions, [{first_name: 'Child', last_name: 'Family'}]);
  assert.equal(groupPayload.next_of_kin_phone, '0822222222');
  console.log('PASS: trip groups combine registered members and children with one emergency contact.');

  const {default: ThembaMap} = await server.ssrLoadModule('/src/components/ThembaMap.jsx');
  await act(async () => root.render(React.createElement(ThembaMap, {markers: [
    {id:'dep', kind:'rank', label:'Ongoye Main Rank', lat:-28.84, lng:31.89},
    {id:'dest', kind:'destination', label:'Empangeni', lat:-28.74, lng:31.89}
  ]})));
  await act(async () => document.querySelector('[aria-label="Ongoye Main Rank operating hours"]').click());
  assert.match(document.querySelector('.leaflet-popup-content').textContent, /06:30–19:30 daily/);
  await act(async () => document.querySelector('[aria-label="Empangeni operating hours"]').click());
  assert.match(document.querySelector('.leaflet-popup-content').textContent, /Empangeni/);
  console.log('PASS: both rank markers/cards open operating hours in map popups.');

} finally {
  await act(async () => root.unmount());
  await server.close();
  dom.window.close();
}
