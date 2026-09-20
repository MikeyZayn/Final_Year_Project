import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from './auth';
const roles = ['passenger', 'driver', 'operator', 'administrator'];
import api from './api';

const demoUsers = {
  passenger: 'Sibusiso Dlamini',
  driver: 'Bongani Mthembu',
  operator: 'Nqobile Zondi',
  administrator: 'THEMBA Administrator',
};

const locationCoordinates = {
  Ongoye: [-28.844, 31.895],
  'Ongoye Main Rank': [-28.844, 31.895],
  'Kwa-Dlangezwa': [-28.844, 31.895],
  Empangeni: [-28.742, 31.893],
  'Empangeni Rank 1': [-28.742, 31.893],
  'Empangeni Rank 2': [-28.742, 31.893],
  'Empangeni Rank 3': [-28.742, 31.893],
  'Empangeni Rank 4': [-28.742, 31.893],
  'Richards Bay': [-28.780, 32.038],
  'Richards Bay Main Rank': [-28.780, 32.038],
  eSikhawini: [-28.879, 31.899],
  'eSikhawini Main Rank': [-28.879, 31.899],
};

const routeFares = [
  ['Ongoye', 'Empangeni', 24],
  ['Ongoye', 'Richards Bay', 34],
  ['Ongoye', 'eSikhawini', 20],
  ['Empangeni', 'Richards Bay', 20],
  ['Empangeni', 'eSikhawini', 24],
  ['Richards Bay', 'eSikhawini', 16],
];

const trips = routeFares.flatMap(([origin, destination, fare], index) => (
  [
    [origin, destination],
    [destination, origin],
  ].map(([tripOrigin, tripDestination], directionIndex) => ({
    id: `TH-ROUTE-${String(index * 2 + directionIndex + 1).padStart(3, '0')}`,
    route: `${tripOrigin} to ${tripDestination}`,
    date: '15 September 2026',
    departure: directionIndex ? '10:00' : '09:00',
    fare: `R${fare}`,
    status: directionIndex ? 'Scheduled' : 'Boarding',
    duration: 'Route estimate',
    origin: tripOrigin,
    destination: tripDestination,
    eta: 'Route estimate',
  }))
));

const openRouteServiceKey = import.meta.env.VITE_OPENROUTESERVICE_API_KEY;

function getProfileDefaults(role) {
  return {
    passenger: {
      name: 'Sibusiso Dlamini',
      phone: '082 123 4567',
      email: 'sibusiso@temba.co.za',
      homeArea: 'Empangeni',
      emergencyContact: 'Nandi Dlamini',
      password: '',
      newPassword: '',
      confirmPassword: '',
      avatarInitials: 'SD',
      preferences: {
        emailAlerts: true,
        smsAlerts: true,
        pushAlerts: false,
      },
    },
    driver: {
      name: 'Bongani Mthembu',
      phone: '071 246 8132',
      email: 'bongani@temba.co.za',
      licenseNo: 'ND 123-456',
      vehicle: 'Toyota Quantum',
      password: '',
      newPassword: '',
      confirmPassword: '',
      avatarInitials: 'BM',
      preferences: {
        emailAlerts: true,
        smsAlerts: true,
        pushAlerts: true,
      },
    },
    operator: {
      name: 'Nqobile Zondi',
      phone: '082 659 1122',
      email: 'nqobile@temba.co.za',
      operatorCode: 'TH-OPS-018',
      region: 'King Cetshwayo',
      password: '',
      newPassword: '',
      confirmPassword: '',
      avatarInitials: 'NZ',
      preferences: {
        emailAlerts: true,
        smsAlerts: false,
        pushAlerts: true,
      },
    },
    administrator: {
      name: 'THEMBA Administrator',
      phone: '060 443 9801',
      email: 'admin@temba.co.za',
      department: 'Operations & Safety',
      accessLevel: 'Full access',
      password: '',
      newPassword: '',
      confirmPassword: '',
      avatarInitials: 'TA',
      preferences: {
        emailAlerts: true,
        smsAlerts: true,
        pushAlerts: true,
      },
    },
  }[role] || {
    name: demoUsers[role] || 'User',
    phone: '',
    email: '',
    password: '',
    newPassword: '',
    confirmPassword: '',
    avatarInitials: 'U',
    preferences: {
      emailAlerts: true,
      smsAlerts: true,
      pushAlerts: false,
    },
  };
}

function App() {
  const [screen, setScreen] = useState('welcome');
  const [role, setRole] = useState('passenger');
  const [activeTrip, setActiveTrip] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState(getProfileDefaults('passenger'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [issuedVerificationCodes, setIssuedVerificationCodes] = useState({});

  function notify(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  }

  useEffect(() => {
    setProfile(getProfileDefaults(role));
  }, [role]);

  function enterDashboard(selectedRole = role) {
    setRole(selectedRole);
    setScreen('dashboard');
  }

  return (
    <div className={darkMode ? 'app dark' : 'app light'}>
      <header className="topbar">
        <button className="brand" onClick={() => setScreen('welcome')} type="button">
          <span className="brand-mark">T</span>
          <span>
            <strong>THEMBA</strong>
            <small>Transport Hub with Evaluated Mobility, Boarding & Accountability</small>
          </span>
        </button>

        <div className="top-actions">
          <button className="text-button" onClick={() => setDarkMode((value) => !value)} type="button">
            {darkMode ? 'Light mode' : 'Dark mode'}
          </button>
          {screen !== 'welcome' && (
            <button className="settings-button" onClick={() => setSettingsOpen(true)} type="button">
              Settings
            </button>
          )}
          {screen !== 'welcome' && (
            <button className="outline-button" onClick={() => setScreen('welcome')} type="button">
              Exit
            </button>
          )}
        </div>
      </header>

      <main className="page-shell">
        {screen === 'welcome' && (
          <Welcome
            onLogin={() => setScreen('login')}
            onGuest={() => enterDashboard('passenger')}
            onRegister={() => setScreen('register')}
          />
        )}

        {screen === 'login' && (
          <Login
            role={role}
            setRole={setRole}
            onBack={() => setScreen('welcome')}
            onAuthed={(backendRole) => {
              const frontendRole = backendRole === 'admin' ? 'administrator' : backendRole;
              setRole(frontendRole);
              setScreen('dashboard');
              notify('Signed in.');
            }}
          />
        )}

        {screen === 'register' && (
          <Register
            role={role}
            setRole={setRole}
            onBack={() => setScreen('welcome')}
            onAuthed={(backendRole) => {
              const frontendRole = backendRole === 'admin' ? 'administrator' : backendRole;
              setRole(frontendRole);
              setScreen('dashboard');
              notify('Account created.');
            }}
          />
        )}
        {screen === 'dashboard' && (
          <Dashboard
            role={role}
            activeTrip={activeTrip}
            setActiveTrip={setActiveTrip}
            notify={notify}
            issuedVerificationCodes={issuedVerificationCodes}
            issueVerificationCode={(tripId) => {
              const code = `${tripId}-${Math.floor(1000 + Math.random() * 9000)}`;
              setIssuedVerificationCodes((currentCodes) => ({ ...currentCodes, [tripId]: code }));
              notify(`Verification code ${code} issued to the passenger.`);
            }}
          />
        )}
      </main>

      {settingsOpen && (
        <ProfileSettings
          role={role}
          profile={profile}
          setProfile={setProfile}
          onClose={() => setSettingsOpen(false)}
          notify={notify}
        />
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function ProfileSettings({ role, profile, setProfile, onClose, notify }) {
  function handleFieldChange(event) {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
  }

  function handlePreferenceChange(key) {
    setProfile((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        [key]: !current.preferences?.[key],
      },
    }));
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <div>
            <div className="eyebrow">Profile settings</div>
            <h3>{demoUsers[role]}</h3>
          </div>
          <button className="text-button" onClick={onClose} type="button">Close</button>
        </div>

        <div className="avatar-card">
          <div className="avatar-badge">{profile.avatarInitials || 'U'}</div>
          <div>
            <strong>{profile.name || demoUsers[role]}</strong>
            <small>{profile.email || 'No email on file'}</small>
          </div>
          <button className="secondary-button" type="button">Change photo</button>
        </div>

        <div className="settings-section">
          <div className="section-title">Personal details</div>
          <div className="settings-grid">
            <label>
              Full name
              <input name="name" value={profile.name || ''} onChange={handleFieldChange} />
            </label>
            <label>
              Phone number
              <input name="phone" value={profile.phone || ''} onChange={handleFieldChange} />
            </label>
            <label>
              Email address
              <input name="email" value={profile.email || ''} onChange={handleFieldChange} />
            </label>
            <label>
              Preferred language
              <input value="English" readOnly />
            </label>

            {role === 'passenger' && (
              <>
                <label>
                  Home area
                  <input name="homeArea" value={profile.homeArea || ''} onChange={handleFieldChange} />
                </label>
                <label>
                  Emergency contact
                  <input name="emergencyContact" value={profile.emergencyContact || ''} onChange={handleFieldChange} />
                </label>
              </>
            )}

            {role === 'driver' && (
              <>
                <label>
                  License number
                  <input name="licenseNo" value={profile.licenseNo || ''} onChange={handleFieldChange} />
                </label>
                <label>
                  Vehicle
                  <input name="vehicle" value={profile.vehicle || ''} onChange={handleFieldChange} />
                </label>
              </>
            )}

            {role === 'operator' && (
              <>
                <label>
                  Operator code
                  <input name="operatorCode" value={profile.operatorCode || ''} onChange={handleFieldChange} />
                </label>
                <label>
                  Region
                  <input name="region" value={profile.region || ''} onChange={handleFieldChange} />
                </label>
              </>
            )}

            {role === 'administrator' && (
              <>
                <label>
                  Department
                  <input name="department" value={profile.department || ''} onChange={handleFieldChange} />
                </label>
                <label>
                  Access level
                  <input name="accessLevel" value={profile.accessLevel || ''} onChange={handleFieldChange} />
                </label>
              </>
            )}
          </div>
        </div>

        <div className="settings-section">
          <div className="section-title">Security</div>
          <div className="settings-grid single-column">
            <label>
              Current password
              <input name="password" type="password" value={profile.password || ''} onChange={handleFieldChange} />
            </label>
            <label>
              New password
              <input name="newPassword" type="password" value={profile.newPassword || ''} onChange={handleFieldChange} />
            </label>
            <label>
              Confirm password
              <input name="confirmPassword" type="password" value={profile.confirmPassword || ''} onChange={handleFieldChange} />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-title">Notifications</div>
          <div className="checkbox-stack">
            <label className="checkbox-row">
              <input
                checked={Boolean(profile.preferences?.emailAlerts)}
                onChange={() => handlePreferenceChange('emailAlerts')}
                type="checkbox"
              />
              Email alerts
            </label>
            <label className="checkbox-row">
              <input
                checked={Boolean(profile.preferences?.smsAlerts)}
                onChange={() => handlePreferenceChange('smsAlerts')}
                type="checkbox"
              />
              SMS alerts
            </label>
            <label className="checkbox-row">
              <input
                checked={Boolean(profile.preferences?.pushAlerts)}
                onChange={() => handlePreferenceChange('pushAlerts')}
                type="checkbox"
              />
              Push notifications
            </label>
          </div>
        </div>

        <div className="settings-actions">
          <button className="secondary-button" onClick={onClose} type="button">Cancel</button>
          <button
            className="primary-button"
            onClick={() => {
              notify('Profile updated successfully.');
              onClose();
            }}
            type="button"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function Welcome({ onLogin, onGuest, onRegister }) {
  return (
    <section className="welcome-panel">
      <div className="eyebrow">South African transport information platform</div>
      <h1>
        Travel information.<br />
        <em>Verified trips.</em><br />
        Safer journeys.
      </h1>
      <p className="lead">
        Find the right route, understand the fare, and connect every completed trip to accountable passenger feedback.
      </p>

      <div className="welcome-actions">
        <button className="primary-button" onClick={onLogin} type="button">
          Sign in <span>→</span>
        </button>
        <button className="secondary-button" onClick={onRegister} type="button">
          Create an account
        </button>
        <button className="text-button" onClick={onGuest} type="button">
          Continue as guest →
        </button>
      </div>

      <div className="feature-strip">
        <span>01 / Route clarity</span>
        <span>02 / Trip verification</span>
        <span>03 / Accountable feedback</span>
      </div>
    </section>
  );
}

function Login({ role, setRole, onBack, onAuthed }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError('');
    if (!phone || !password) {
      setError('Phone number and password are required.');
      return;
    }
    setBusy(true);
    try {
      const user = await login(phone.trim(), password);
      onAuthed(user.role);
    } catch (err) {
      const data = err.response?.data;
      const message =
        data?.non_field_errors?.[0] ||
        data?.detail ||
        data?.phone?.[0] ||
        'Login failed. Check your phone number and password.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <button className="back-link" onClick={onBack} type="button">← Back</button>
      <div className="eyebrow">Secure access</div>
      <h2>Welcome back.</h2>
      <p className="muted">Sign in with the phone number you registered with.</p>

      <label>
        Phone number
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0821234567"
          autoComplete="tel"
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
        />
      </label>

      {error && (
        <p className="danger-button" style={{ display: 'block', marginTop: 4 }}>
          {error}
        </p>
      )}

      <button
        className="primary-button full"
        onClick={handleSubmit}
        type="button"
        disabled={busy}
      >
        {busy ? 'Signing in…' : <>Sign in <span>→</span></>}
      </button>
      <button className="secondary-button full" onClick={onBack} type="button">
        Back to welcome
      </button>
    </section>
  );
}

function Register({ role, setRole, onBack, onAuthed }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    password: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    license_number: '',
    rank_code: '',
  });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    setError('');
    if (!form.phone || !form.password) {
      setError('Phone number and password are required.');
      return;
    }

    setBusy(true);
    try {
      let user;
      if (role === 'passenger') {
        user = await register('/accounts/api/register/passenger/', {
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          email: form.email,
          password: form.password,
          next_of_kin_name: form.next_of_kin_name,
          next_of_kin_phone: form.next_of_kin_phone,
        });
      } else if (role === 'driver') {
        if (!photo) {
          setError('Please attach a photo for driver verification.');
          setBusy(false);
          return;
        }
        const fd = new FormData();
        fd.append('first_name', form.first_name);
        fd.append('last_name', form.last_name);
        fd.append('phone', form.phone);
        fd.append('email', form.email);
        fd.append('password', form.password);
        fd.append('license_number', form.license_number);
        fd.append('rank_code', form.rank_code);
        fd.append('photo', photo);
        user = await register('/accounts/api/register/driver/', fd);
      } else if (role === 'operator') {
        user = await register('/accounts/api/register/operator/', {
          phone: form.phone,
          email: form.email,
          password: form.password,
          rank_code: form.rank_code,
        });
      } else {
        setError('Administrator accounts are created by invitation only.');
        setBusy(false);
        return;
      }
      onAuthed(user.role);
    } catch (err) {
      const data = err.response?.data;
      const firstError =
        (data && typeof data === 'object' && Object.values(data).flat()?.[0]) ||
        'Registration failed.';
      setError(String(firstError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <button className="back-link" onClick={onBack} type="button">← Back</button>
      <div className="eyebrow">Account registration</div>
      <h2>Join THEMBA.</h2>
      <p className="muted">
        Passenger accounts are active immediately. Driver accounts require operator approval.
      </p>

      <RolePicker role={role} setRole={setRole} />

      {role !== 'operator' && role !== 'administrator' && (
        <div className="form-grid">
          <label>
            First name
            <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
          </label>
          <label>
            Surname
            <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </label>
        </div>
      )}

      <label>
        Cellphone number
        <input
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="0821234567"
        />
      </label>

      <label>
        Email (optional)
        <input
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="you@example.co.za"
        />
      </label>

      {role === 'passenger' && (
        <>
          <label>
            Emergency contact — name
            <input
              value={form.next_of_kin_name}
              onChange={(e) => set('next_of_kin_name', e.target.value)}
            />
          </label>
          <label>
            Emergency contact — phone
            <input
              value={form.next_of_kin_phone}
              onChange={(e) => set('next_of_kin_phone', e.target.value)}
            />
          </label>
        </>
      )}

      {role === 'driver' && (
        <>
          <label>
            Driver license number
            <input
              value={form.license_number}
              onChange={(e) => set('license_number', e.target.value)}
            />
          </label>
          <label>
            Association rank code
            <input
              value={form.rank_code}
              onChange={(e) => set('rank_code', e.target.value)}
              placeholder="e.g. KDL001"
            />
          </label>
          <label>
            Verification photo
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
          </label>
        </>
      )}

      {role === 'operator' && (
        <label>
          Association rank code
          <input
            value={form.rank_code}
            onChange={(e) => set('rank_code', e.target.value)}
            placeholder="e.g. KDL001"
          />
        </label>
      )}

      {role === 'administrator' && (
        <p className="muted">
          Administrator accounts are created by invitation only. Contact the system owner.
        </p>
      )}

      <label>
        Password
        <input
          type="password"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
        />
      </label>

      {error && (
        <p className="danger-button" style={{ display: 'block', marginTop: 4 }}>
          {error}
        </p>
      )}

      <button
        className="primary-button full"
        onClick={handleSubmit}
        type="button"
        disabled={busy || role === 'administrator'}
      >
        {busy ? 'Creating account…' : <>Submit registration <span>→</span></>}
      </button>
    </section>
  );
}

function RolePicker({ role, setRole }) {
  return (
    <div className="role-picker">
      {roles.map((item) => (
        <button
          key={item}
          className={role === item ? 'selected' : ''}
          onClick={() => setRole(item)}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function Dashboard({ role, activeTrip, setActiveTrip, notify, issuedVerificationCodes, issueVerificationCode }) {
  const { user } = useAuth();
  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.phone ||
    demoUsers[role] ||
    'User';
  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">{role} dashboard</div>
          <h2>{displayName}</h2>
        </div>
      </div>

      {role === 'passenger' && <Passenger activeTrip={activeTrip} setActiveTrip={setActiveTrip} notify={notify} issuedVerificationCodes={issuedVerificationCodes} />}
      {role === 'driver' && <Driver notify={notify} />}
      {role === 'operator' && <Operator notify={notify} />}
      {role === 'administrator' && <Administrator notify={notify} />}
    </section>
  );
}

function FitRouteBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [28, 28] });
    }
  }, [map, points]);

  return null;
}

function RouteMapPanel({ trip }) {
  const [routePoints, setRoutePoints] = useState([
    locationCoordinates[trip.origin],
    locationCoordinates[trip.destination],
  ]);
  const [routeSource, setRouteSource] = useState('Local route preview');

  useEffect(() => {
    let cancelled = false;
    const fallbackPoints = [locationCoordinates[trip.origin], locationCoordinates[trip.destination]];

    setRoutePoints(fallbackPoints);
    setRouteSource(openRouteServiceKey ? 'Loading OpenRouteService route...' : 'Local route preview');

    if (!openRouteServiceKey) {
      return undefined;
    }

    fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        Authorization: openRouteServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [
          locationCoordinates[trip.origin].slice().reverse(),
          locationCoordinates[trip.destination].slice().reverse(),
        ],
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('OpenRouteService request failed');
        }
        return response.json();
      })
      .then((data) => {
        const coordinates = data.features?.[0]?.geometry?.coordinates;
        if (!cancelled && coordinates?.length) {
          setRoutePoints(coordinates.map(([longitude, latitude]) => [latitude, longitude]));
          setRouteSource('OpenRouteService road route');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRouteSource('Local route preview · routing service unavailable');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [trip]);

  return (
    <div className="module route-map-panel">
      <div className="module-heading">
        <span>Route preview</span>
        <span className="module-number">{trip.fare}</span>
      </div>

      <div className="route-map leaflet-map">
        <MapContainer center={routePoints[0]} zoom={11} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRouteBounds points={routePoints} />
          <Polyline positions={routePoints} pathOptions={{ color: '#e3a441', weight: 6 }} />
          <CircleMarker center={routePoints[0]} radius={8} pathOptions={{ color: '#173d3b', fillColor: '#7fbf7c', fillOpacity: 1 }} />
          <CircleMarker center={routePoints[routePoints.length - 1]} radius={8} pathOptions={{ color: '#173d3b', fillColor: '#d06d5f', fillOpacity: 1 }} />
        </MapContainer>
      </div>

      <p className="map-source">{routeSource}</p>

      <div className="route-summary">
        <div>
          <span className="route-label">From</span>
          <strong>{trip.origin}</strong>
        </div>
        <div>
          <span className="route-label">To</span>
          <strong>{trip.destination}</strong>
        </div>
        <div>
          <span className="route-label">Fare</span>
          <strong>{trip.fare}</strong>
        </div>
        <div>
          <span className="route-label">Service</span>
          <strong>Direct</strong>
        </div>
      </div>
    </div>
  );
}

function Passenger({ activeTrip, setActiveTrip, notify, issuedVerificationCodes }) {
  const [verificationCode, setVerificationCode] = useState('');
  const [departure, setDeparture] = useState('');
  const [destination, setDestination] = useState('');
  const [matchingTrips, setMatchingTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  function searchTrips() {
    const cleanedDeparture = departure.trim().toLowerCase();
    const cleanedDestination = destination.trim().toLowerCase();
    const results = trips.filter((trip) => {
      const matchesDeparture = !cleanedDeparture || trip.origin.toLowerCase().includes(cleanedDeparture);
      const matchesDestination = !cleanedDestination || trip.destination.toLowerCase().includes(cleanedDestination);
      return matchesDeparture && matchesDestination;
    });

    setMatchingTrips(results);
    setSelectedTrip(results[0] || null);
    setBookingConfirmed(false);
    setVerificationCode('');
    setActiveTrip(null);
    notify(results.length ? `${results.length} matching trip${results.length === 1 ? '' : 's'} found.` : 'No matching trips found.');
  }

  function confirmBooking() {
    if (!selectedTrip) {
      notify('Search for and select a trip first.');
      return;
    }

    setBookingConfirmed(true);
    setVerificationCode('');
    notify('Booking confirmed. Wait for the operator to give you the verification code.');
  }

  function verifyTripCode() {
    const cleanedCode = verificationCode.trim();
    if (!cleanedCode) {
      notify('Enter a verification code first.');
      return;
    }

    const issuedCode = selectedTrip ? issuedVerificationCodes[selectedTrip.id] : null;
    const matchedTrip = selectedTrip && issuedCode && issuedCode.toLowerCase() === cleanedCode.toLowerCase()
      ? selectedTrip
      : null;

    if (!matchedTrip) {
      notify(issuedCode ? 'That code does not match your booking.' : 'Wait for the operator to give you a verification code.');
      return;
    }

    setActiveTrip(matchedTrip);
    notify(`Route ${matchedTrip.route} unlocked.`);
  }

  function selectTrip(trip) {
    setSelectedTrip(trip);
    setBookingConfirmed(false);
    setVerificationCode('');
    setActiveTrip(null);
  }

  const displayedTrips = matchingTrips.length ? matchingTrips : trips;

  return (
    <>
      <div className="dashboard-grid">
        <article className="module module-wide">
          <div className="module-heading">
            <span>Find transport</span>
            <span className="module-number">01</span>
          </div>

          <div className="form-grid">
            <label>
              Departure point
              <input value={departure} onChange={(event) => setDeparture(event.target.value)} placeholder="Empangeni" />
            </label>
            <label>
              Destination
              <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Durban" />
            </label>
          </div>

          <button className="primary-button" onClick={searchTrips} type="button">
            Search trips <span>→</span>
          </button>
        </article>
      </div>

      <div className="module">
        <div className="module-heading">
          <span>{matchingTrips.length ? 'Search results' : 'Available trips'}</span>
          <span className="module-number">02</span>
        </div>

        {displayedTrips.map((trip) => (
          <button
            className={selectedTrip?.id === trip.id ? 'trip-row active' : 'trip-row'}
            key={trip.id}
            onClick={() => selectTrip(trip)}
            type="button"
          >
            <span>
              <strong>{trip.route}</strong>
              <small>
                {trip.date} · {trip.id} · {trip.departure} · {trip.status}
              </small>
            </span>
            <b>{trip.fare}</b>
          </button>
        ))}
      </div>

      {selectedTrip && <RouteMapPanel trip={selectedTrip} />}

      {selectedTrip && !bookingConfirmed && (
        <div className="module">
          <div className="module-heading">
            <span>Confirm booking</span>
            <span className="module-number">03</span>
          </div>
          <p className="muted">
            Confirm your booking for {selectedTrip.route} on {selectedTrip.date} at {selectedTrip.departure}.
          </p>
          <button className="primary-button" onClick={confirmBooking} type="button">
            Confirm booking <span>→</span>
          </button>
        </div>
      )}

      {bookingConfirmed && (
        <div className="module">
          <div className="module-heading">
            <span>Verification code</span>
            <span className="module-number">04</span>
          </div>

          <p className="muted">Your booking is confirmed. Wait for the operator to give you the verification code, then enter it below.</p>
          <input
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            placeholder="Enter code, e.g. TH-EMP-001"
          />
          <button className="secondary-button" onClick={verifyTripCode} type="button">
            Verify trip
          </button>
        </div>
      )}

      {activeTrip && (
        <div className="module verified-trip">
          <div>
            <div className="eyebrow">Verified trip</div>
            <h3>{activeTrip.route}</h3>
            <p className="muted">Driver: Bongani Mthembu · Toyota Quantum ND 123-456</p>
          </div>

          <button className="danger-button" onClick={() => notify('Emergency alert prepared for the active trip.')} type="button">
            Panic alert
          </button>
          <button className="primary-button" onClick={() => notify('Feedback form opened for the completed trip.')} type="button">
            Give feedback
          </button>
        </div>
      )}

    </>
  );
}

function Driver({ notify }) {
  return (
    <div className="dashboard-grid">
      <article className="module module-wide">
        <div className="module-heading">
          <span>Trip manifest</span>
          <span className="module-number">03 trips</span>
        </div>

        {trips.map((trip) => (
          <div className="trip-row" key={trip.id}>
            <span>
              <strong>{trip.route}</strong>
              <small>
                Driver: Bongani Mthembu
              </small>
              <small>
                {trip.date} · {trip.id} · {trip.departure}
              </small>
            </span>
            <b>{trip.status}</b>
          </div>
        ))}
      </article>

      <article className="module">
        <div className="module-heading">
          <span>Passenger rating</span>
          <span className="module-number">4.7 / 5</span>
        </div>
        <p className="rating">
          ★★★★<span>★</span>
        </p>
        <p className="muted">Based on verified passenger feedback.</p>
        <button className="secondary-button" onClick={() => notify('Trip status marked ready for verification.')} type="button">
          Update status
        </button>
      </article>
    </div>
  );
}

function Operator({ notify }) {
  return (
    <div className="dashboard-grid">
      <OperatorRoutes notify={notify} />
      <OperatorDeparturePoints />
      <OperatorRequestRank notify={notify} />

      {/* -------------------------------------------------------------
          Placeholder modules kept as UI design references for the SDD.
          Not wired to anything — visual mockups only.
          ------------------------------------------------------------- */}
      <article className="module module-wide" style={{ opacity: 0.55 }}>
        <div className="module-heading">
          <span>Active trip engagement</span>
          <span className="module-number">UI preview</span>
        </div>
        <p className="muted">
          Operational tier — see Section 5.2.2 of the proposal. Operator will claim a trip
          instance, verify its driver and vehicle, and register passengers.
        </p>
      </article>

      <article className="module" style={{ opacity: 0.55 }}>
        <div className="module-heading">
          <span>Complaints</span>
          <span className="module-number">UI preview</span>
        </div>
        <p className="muted">
          Central contribution tier — see Section 5.2.3. Flag passenger complaints for admin
          review; escalation handled by the rank admin.
        </p>
      </article>

      <article className="module" style={{ opacity: 0.55 }}>
        <div className="module-heading">
          <span>Verification</span>
          <span className="module-number">UI preview</span>
        </div>
        <p className="muted">
          Trip-verification tier — issue a single-use code to a passenger for a specific trip.
        </p>
      </article>
    </div>
  );
}

function OperatorRoutes({ notify }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/transport/api/my-routes/');
      setRoutes(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load routes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    if (!window.confirm('Deactivate this route?')) return;
    try {
      await api.delete(`/transport/api/my-routes/${id}/`);
      notify('Route deactivated.');
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to deactivate.');
    }
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>My routes</span>
        <span className="module-number">{routes.length}</span>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}

      {!loading && routes.length === 0 && !showForm && (
        <p className="muted">You have no routes yet. Add one below.</p>
      )}

      {routes.map((r) => (
        <div className="trip-row" key={r.id}>
          <span>
            <strong>
              {r.departure_point.rank.name} → {r.destination.name}
            </strong>
            <small>
              {r.service_category} · R{r.fare}
              {r.typical_duration_minutes ? ` · ~${r.typical_duration_minutes} min` : ''}
            </small>
          </span>
          <button className="danger-button" onClick={() => handleDelete(r.id)} type="button">
            Deactivate
          </button>
        </div>
      ))}

      {showForm ? (
        <OperatorAddRouteForm
          onDone={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
          notify={notify}
        />
      ) : (
        <button
          className="primary-button"
          onClick={() => setShowForm(true)}
          type="button"
          style={{ marginTop: 12 }}
        >
          Add route <span>→</span>
        </button>
      )}
    </article>
  );
}

function OperatorAddRouteForm({ onDone, onCancel, notify }) {
  const [departurePoints, setDeparturePoints] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [dpId, setDpId] = useState('');
  const [destId, setDestId] = useState('');
  const [fare, setFare] = useState('');
  const [category, setCategory] = useState('structured');
  const [duration, setDuration] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [dpRes, destRes] = await Promise.all([
          api.get('/transport/api/my-departure-points/'),
          api.get('/transport/api/destinations/'),
        ]);
        const activeDPs = dpRes.data.filter((d) => d.status === 'active');
        setDeparturePoints(activeDPs);
        setDestinations(destRes.data);
        if (activeDPs[0]) setDpId(activeDPs[0].id);
        if (destRes.data[0]) setDestId(destRes.data[0].id);
      } catch {
        setError('Could not load form options.');
      }
    })();
  }, []);

  async function submit() {
    setError('');
    if (!dpId || !destId || !fare) {
      setError('Departure point, destination and fare are required.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/transport/api/my-routes/', {
        departure_point_id: Number(dpId),
        destination_id: Number(destId),
        fare,
        service_category: category,
        typical_duration_minutes: duration ? Number(duration) : null,
      });
      notify('Route created.');
      onDone();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create route.');
    } finally {
      setBusy(false);
    }
  }

  if (departurePoints.length === 0) {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <p className="muted">
          You have no approved departure points yet. Request a rank first.
        </p>
        <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div className="form-grid">
        <label>
          Departure point
          <select value={dpId} onChange={(e) => setDpId(e.target.value)}>
            {departurePoints.map((d) => (
              <option key={d.id} value={d.id}>{d.rank.name}</option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <select value={destId} onChange={(e) => setDestId(e.target.value)}>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label>
          Fare (R)
          <input value={fare} onChange={(e) => setFare(e.target.value)} placeholder="24.00" />
        </label>
        <label>
          Service category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="structured">Structured</option>
            <option value="unstructured">Unstructured</option>
          </select>
        </label>
        <label>
          Typical duration (min, optional)
          <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" />
        </label>
      </div>
      {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
        <button className="primary-button" onClick={submit} disabled={busy} type="button">
          {busy ? 'Creating…' : 'Create route'}
        </button>
      </div>
    </div>
  );
}

function OperatorDeparturePoints() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/transport/api/my-departure-points/');
        setPoints(data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Could not load departure points.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <article className="module">
      <div className="module-heading">
        <span>My departure points</span>
        <span className="module-number">{points.length}</span>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}
      {!loading && points.length === 0 && (
        <p className="muted">No departure points yet. Request a rank.</p>
      )}
      {points.map((p) => (
        <div className="trip-row" key={p.id}>
          <span>
            <strong>{p.rank.name}</strong>
            <small>{p.rank.area}</small>
          </span>
          <span
            className="status-pill"
            style={{
              borderColor: p.status === 'active' ? 'var(--success)' : 'var(--accent)',
              color: p.status === 'active' ? 'var(--success)' : 'var(--accent)',
            }}
          >
            {p.status}
          </span>
        </div>
      ))}
    </article>
  );
}

function OperatorRequestRank({ notify }) {
  const [ranks, setRanks] = useState([]);
  const [myRankIds, setMyRankIds] = useState([]);
  const [rankId, setRankId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function loadOptions() {
    try {
      const [rankRes, myRes] = await Promise.all([
        api.get('/transport/api/ranks/'),
        api.get('/transport/api/my-departure-points/'),
      ]);
      setRanks(rankRes.data);
      const mine = myRes.data.map((d) => d.rank.id);
      setMyRankIds(mine);
      const available = rankRes.data.filter((r) => !mine.includes(r.id));
      if (available[0]) setRankId(available[0].id);
    } catch {
      setError('Could not load ranks.');
    }
  }

  useEffect(() => { loadOptions(); }, []);

  async function submit() {
    setError('');
    if (!rankId) { setError('Pick a rank.'); return; }
    setBusy(true);
    try {
      await api.post('/transport/api/request-rank/', {
        rank_id: Number(rankId),
        notes,
      });
      notify('Rank request submitted for approval.');
      setNotes('');
      setShowForm(false);
      loadOptions();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit request.');
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
        Want to load from another rank? Request it here — the rank&apos;s admin will review.
      </p>

      {!showForm && (
        <button className="secondary-button" onClick={() => setShowForm(true)} type="button">
          Request rank
        </button>
      )}

      {showForm && (
        availableRanks.length === 0 ? (
          <p className="muted">You already have a departure point at every rank.</p>
        ) : (
          <>
            <label>
              Rank
              <select value={rankId} onChange={(e) => setRankId(e.target.value)}>
                {availableRanks.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.area})</option>
                ))}
              </select>
            </label>
            <label>
              Reason (optional)
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. festive season extra trips"
              />
            </label>
            {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button className="secondary-button" onClick={() => setShowForm(false)} type="button">
                Cancel
              </button>
              <button className="primary-button" onClick={submit} disabled={busy} type="button">
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </>
        )
      )}
    </article>
  );
}

function Administrator({ notify }) {
  return (
    <div className="dashboard-grid">
      <article className="module module-wide">
        <div className="module-heading">
          <span>Trip management</span>
          <span className="module-number">01</span>
        </div>
        <p className="muted">
          Create, edit, cancel and assign structured trips while preserving the audit history.
        </p>
        <button className="primary-button" onClick={() => notify('Trip management opened.')} type="button">
          Manage trips <span>→</span>
        </button>
      </article>

      <article className="module">
        <div className="module-heading">
          <span>Approvals</span>
          <span className="module-number">02 pending</span>
        </div>
        <p className="muted">Driver and operator applications awaiting review.</p>
        <button className="secondary-button" onClick={() => notify('Approval queue opened.')} type="button">
          Review approvals
        </button>
      </article>

      <article className="module">
        <div className="module-heading">
          <span>Escalations</span>
          <span className="module-number">03 open</span>
        </div>
        <p className="muted">
          Review escalated complaints and formally confirm safety incidents only after investigation.
        </p>
        <button className="secondary-button" onClick={() => notify('Safety incident review opened.')} type="button">
          Review incidents
        </button>
      </article>

      <article className="module">
        <div className="module-heading">
          <span>Queue and vehicles</span>
          <span className="module-number">04</span>
        </div>
        <p className="muted">Manage queue order, roadworthiness status and driver/vehicle assignments.</p>
        <button className="secondary-button" onClick={() => notify('Queue management opened.')} type="button">
          Manage queue
        </button>
      </article>
    </div>
  );
}

export default App;
