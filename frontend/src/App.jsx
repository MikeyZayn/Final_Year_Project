import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from './auth';
const roles = ['passenger', 'driver', 'operator', 'administrator'];
import api from './api';
import DriverPage from './pages/DriverPage.jsx';
import ThembaMap from './components/ThembaMap.jsx';

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
    id_number: '',
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
        fd.append('id_number', form.id_number);
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
            SA ID number
            <input
              value={form.id_number}
              onChange={(e) => set('id_number', e.target.value)}
              maxLength={13}
              placeholder="13 digits"
            />
          </label>
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
      {role === 'driver' && <DriverPage notify={notify} />}
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

function Passenger({ notify }) {
  // ----- shared state -----
  const [departure, setDeparture] = useState('');
  const [destination, setDestination] = useState('');
  const [trips, setTrips] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState(null);
  const [feedbackList, setFeedbackList] = useState([]);
  const [ratingFormFor, setRatingFormFor] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [panicAlert, setPanicAlert] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);

  // ----- loaders -----
  async function loadTrips(params = {}) {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (params.from) query.set('from', params.from);
      if (params.to) query.set('to', params.to);
      const qs = query.toString() ? `?${query.toString()}` : '';
      const { data } = await api.get(`/transport/api/trips/${qs}`);
      setTrips(data);
    } catch {
      setError('Could not load trips. Is the backend running?');
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    try {
      const { data } = await api.get('/transport/api/my-bookings/');
      setBookings(data);
    } catch { /* ignore */ }
  }

  async function loadFeedback() {
    try {
      const { data } = await api.get('/transport/api/my-feedback/');
      setFeedbackList(data);
    } catch { /* ignore */ }
  }

  async function loadAnnouncements() {
    try {
      const { data } = await api.get('/transport/api/announcements/');
      setAnnouncements(data);
    } catch { /* ignore */ }
  }

  async function loadPanic() {
    try {
      const { data } = await api.get('/transport/api/my-panic/');
      setPanicAlert(data[0] || null);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadTrips();
    loadBookings();
    loadFeedback();
    loadAnnouncements();
    loadPanic();
    const t = setInterval(loadAnnouncements, 30000);
    return () => clearInterval(t);
  }, []);

  // ----- actions -----
  async function bookTrip(tripId) {
    setBookingId(tripId);
    try {
      await api.post('/transport/api/my-bookings/', { trip_id: tripId });
      notify('Booking confirmed. Show up at the rank and tell the operator your name.');
      await loadTrips();
      await loadBookings();
    } catch (err) {
      notify(err.response?.data?.detail || 'Booking failed.');
    } finally {
      setBookingId(null);
    }
  }

  async function cancelBooking(bId) {
    if (!window.confirm('Cancel this booking? You can rebook if seats are still available.')) return;
    try {
      await api.post(`/transport/api/my-bookings/${bId}/cancel/`);
      notify('Booking cancelled.');
      await loadBookings();
      await loadTrips();
    } catch (err) {
      notify(err.response?.data?.detail || 'Cancellation failed.');
    }
  }

  async function raisePanic(bId) {
    if (!window.confirm('Raise a panic alert? The operator will be notified immediately.')) return;
    try {
      const { data } = await api.post(`/transport/api/my-bookings/${bId}/panic/`, { message: '' });
      setPanicAlert(data);
      notify('Panic alert sent. The operator has been notified.');
    } catch (err) {
      notify(err.response?.data?.detail || 'Could not send alert.');
    }
  }

  async function cancelPanic() {
    if (!panicAlert) return;
    if (!window.confirm('Cancel the panic alert? Only do this if it was a mistake.')) return;
    try {
      await api.post(`/transport/api/panic/${panicAlert.id}/cancel/`);
      setPanicAlert(null);
      notify('Alert cancelled.');
    } catch (err) {
      notify(err.response?.data?.detail || 'Could not cancel.');
    }
  }

  function searchTrips() {
    setSelectedTrip(null);
    loadTrips({ from: departure.trim(), to: destination.trim() });
  }

  // ----- render -----
  return (
    <>
      <PassengerPanicBanner alert={panicAlert} onCancel={cancelPanic} />

      <PassengerTripSearch
        departure={departure}
        destination={destination}
        setDeparture={setDeparture}
        setDestination={setDestination}
        onSearch={searchTrips}
      />

      <PassengerAnnouncements announcements={announcements} />

      <PassengerBookings
        bookings={bookings}
        feedbackList={feedbackList}
        onRate={setRatingFormFor}
        onCancel={cancelBooking}
        onPanic={raisePanic}
      />

      <PassengerFeedbackList feedbackList={feedbackList} />

      <PassengerUpcomingTrips
        trips={trips}
        bookings={bookings}
        loading={loading}
        error={error}
        bookingId={bookingId}
        onBook={bookTrip}
        onViewMap={setSelectedTrip}
        selectedTripId={selectedTrip?.id}
      />

      {selectedTrip && (
        <PassengerRouteMap trip={selectedTrip} notify={notify} />
      )}

      {ratingFormFor && (
        <RatingModal
          bookingId={ratingFormFor}
          onClose={() => setRatingFormFor(null)}
          onDone={() => { setRatingFormFor(null); loadFeedback(); loadBookings(); }}
          notify={notify}
        />
      )}
    </>
  );
}

function PassengerPanicBanner({ alert, onCancel }) {
  if (!alert) return null;
  return (
    <div className="module module-wide" style={{ borderColor: 'var(--danger)', borderWidth: 2 }}>
      <div className="module-heading">
        <span style={{ color: 'var(--danger)' }}>⚠ PANIC ALERT ACTIVE</span>
      </div>
      <p className="muted">
        Your alert was sent to the operator at {new Date(alert.created_at).toLocaleTimeString()}.
        Stay where you are if it's safe to do so.
      </p>
      <button className="secondary-button" onClick={onCancel} type="button">
        Cancel alert (false alarm)
      </button>
    </div>
  );
}

function PassengerTripSearch({ departure, destination, setDeparture, setDestination, onSearch }) {
  return (
    <div className="dashboard-grid">
      <article className="module module-wide">
        <div className="module-heading">
          <span>Find a trip</span>
          <span className="module-number">01</span>
        </div>
        <div className="form-grid">
          <label>
            From (rank or area)
            <input
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              placeholder="Empangeni"
            />
          </label>
          <label>
            To (destination)
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Kwa-Dlangezwa"
            />
          </label>
        </div>
        <button className="primary-button" onClick={onSearch} type="button">
          Search trips <span>→</span>
        </button>
      </article>
    </div>
  );
}

function PassengerAnnouncements({ announcements }) {
  if (!announcements.length) return null;
  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Service announcements</span>
        <span className="module-number">{announcements.length}</span>
      </div>
      {announcements.map((a) => (
        <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <strong>{a.title}</strong>
          <small style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
            {a.operator_name}
            {a.route_label ? ` · ${a.route_label}` : ''}
            {' · '}{new Date(a.created_at).toLocaleString()}
          </small>
          <p className="muted" style={{ marginTop: 6 }}>{a.body}</p>
        </div>
      ))}
    </article>
  );
}

function PassengerBookings({ bookings, feedbackList, onRate, onCancel, onPanic }) {
  if (!bookings.length) return null;
  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>My bookings</span>
        <span className="module-number">{bookings.length}</span>
      </div>
      {bookings.map((b) => {
        const alreadyRated = feedbackList.some((f) => f.booking === b.id);
        return (
          <div className="trip-row" key={b.id}>
            <span>
              <strong>{b.route_label}</strong>
              <small>{b.trip_code} · {b.departure_date} · {b.status}</small>
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {b.status === 'completed' && !alreadyRated && (
                <button className="primary-button" onClick={() => onRate(b.id)} type="button">
                  Rate this trip
                </button>
              )}
              {(b.status === 'reserved' || b.status === 'boarded') && (
                <button className="danger-button" onClick={() => onCancel(b.id)} type="button">
                  Cancel
                </button>
              )}
              {b.status === 'boarded' && (
                <button
                  className="danger-button"
                  style={{ background: 'var(--danger)', color: 'white', fontWeight: 700 }}
                  onClick={() => onPanic(b.id)}
                  type="button"
                >
                  PANIC
                </button>
              )}
              <span className="status-pill">{b.status}</span>
            </div>
          </div>
        );
      })}
    </article>
  );
}

function PassengerFeedbackList({ feedbackList }) {
  if (!feedbackList.length) return null;
  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>My feedback</span>
        <span className="module-number">{feedbackList.length}</span>
      </div>
      {feedbackList.map((f) => (
        <div key={f.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>
              <strong>{f.trip_code} · {f.rating}★</strong>
              <small style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
                {f.route_label}
                {f.has_complaint ? ` · Complaint: ${f.category_label}` : ''}
              </small>
            </span>
            <span
              className="status-pill"
              style={{
                borderColor: f.status === 'resolved' ? 'var(--success)' :
                             f.status === 'confirmed_incident' ? 'var(--danger)' : 'var(--accent)',
                color: f.status === 'resolved' ? 'var(--success)' :
                       f.status === 'confirmed_incident' ? 'var(--danger)' : 'var(--accent)',
              }}
            >
              {f.status_label}
            </span>
          </div>
          {f.has_complaint && f.description && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              <em>You wrote:</em> {f.description}
            </p>
          )}
          {f.operator_response && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13, paddingLeft: 12, borderLeft: '2px solid var(--success)' }}>
              <em>Operator replied:</em> {f.operator_response}
            </p>
          )}
          {f.admin_response && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13, paddingLeft: 12, borderLeft: '2px solid var(--danger)' }}>
              <em>Admin:</em> {f.admin_response}
            </p>
          )}
        </div>
      ))}
    </article>
  );
}

function PassengerUpcomingTrips({
  trips, bookings, loading, error, bookingId, onBook, onViewMap, selectedTripId,
}) {
  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Upcoming trips</span>
        <span className="module-number">{trips.length}</span>
      </div>

      {loading && <p className="muted">Loading trips…</p>}
      {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}
      {!loading && !error && trips.length === 0 && (
        <p className="muted">No upcoming trips match. Try clearing the search.</p>
      )}

      {!loading && trips.map((trip) => {
        const alreadyBooked = bookings.some((b) => b.trip === trip.id);
        const isFull = trip.seats_available <= 0;
        const isSelected = selectedTripId === trip.id;
        return (
          <div
            className={isSelected ? 'trip-row active' : 'trip-row'}
            key={trip.id}
            style={{ alignItems: 'center' }}
          >
            <span>
              <strong>
                {trip.route.departure.name} → {trip.route.destination.name}
              </strong>
              <small>
                {trip.trip_code} · {trip.departure_date}
                {trip.expected_departure_time ? ` · ${trip.expected_departure_time.slice(0, 5)}` : ''}
                {' · '}{trip.operator_name}
                {' · '}{trip.seats_available} seats
                {trip.fare ? ` · R${trip.fare}` : ''}
              </small>
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="secondary-button"
                onClick={() => onViewMap(trip)}
                type="button"
              >
                {isSelected ? 'Hide route' : 'View route'}
              </button>
              {alreadyBooked ? (
                <span className="status-pill">Booked</span>
              ) : isFull ? (
                <span className="status-pill" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                  Full
                </span>
              ) : (
                <button
                  className="primary-button"
                  onClick={() => onBook(trip.id)}
                  disabled={bookingId === trip.id}
                  type="button"
                >
                  {bookingId === trip.id ? 'Booking…' : 'Book seat'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </article>
  );
}

function PassengerRouteMap({ trip, notify }) {
  const [geometry, setGeometry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const dep = trip.route.departure;
  const dest = trip.route.destination;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const { data } = await api.post('/transport/api/routing/directions/', {
          origin: { lat: Number(dep.latitude), lng: Number(dep.longitude) },
          destination: { lat: Number(dest.latitude), lng: Number(dest.longitude) },
        });
        if (!cancelled) setGeometry(data.geometry || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || 'Could not load route.');
          notify?.('Route preview unavailable.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [trip.id]);

  const markers = [
    { id: 'dep', lat: Number(dep.latitude), lng: Number(dep.longitude), kind: 'rank', label: dep.name },
    { id: 'dest', lat: Number(dest.latitude), lng: Number(dest.longitude), kind: 'destination', label: dest.name },
  ];

  const polylines = geometry.length >= 2
    ? [{ id: 'route', positions: geometry, color: '#e3a441', weight: 5 }]
    : [];

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Route preview</span>
        <span className="module-number">{dep.name} → {dest.name}</span>
      </div>
      <p className="muted">
        {trip.operator_name} · {trip.departure_date}
        {trip.expected_departure_time ? ` at ${trip.expected_departure_time.slice(0, 5)}` : ''}
        {trip.fare ? ` · R${trip.fare}` : ''}
      </p>

      {loading && <p className="muted">Loading route…</p>}
      {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}

      {!loading && !error && (
        <ThembaMap
          markers={markers}
          polylines={polylines}
          height="360px"
          fitKey={`trip-${trip.id}`}
        />
      )}
    </article>
  );
}

function RatingModal({ bookingId, onClose, onDone, notify }) {
  const [rating, setRating] = useState(5);
  const [hasComplaint, setHasComplaint] = useState(false);
  const [category, setCategory] = useState('punctuality');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (hasComplaint && !description.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/transport/api/my-bookings/${bookingId}/feedback/`, {
        rating,
        has_complaint: hasComplaint,
        category: hasComplaint ? category : '',
        description: hasComplaint ? description : '',
      });
      notify('Feedback submitted.');
      onDone();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Rate this trip</h3>
          <button className="text-button" onClick={onClose} type="button">Close</button>
        </div>

        <div className="settings-section">
          <div className="section-title">Rating</div>
          <div style={{ display: 'flex', gap: 6, fontSize: 32, margin: '10px 0' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                style={{
                  background: 'none', border: 0, cursor: 'pointer',
                  fontSize: 32, padding: 4,
                  color: n <= rating ? 'var(--accent)' : 'var(--muted)',
                }}
                aria-label={`${n} stars`}
              >
                ★
              </button>
            ))}
            <span style={{ marginLeft: 12, alignSelf: 'center', fontSize: 16, color: 'var(--muted)' }}>
              {rating}/5
            </span>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-title">Add a complaint?</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hasComplaint}
              onChange={(e) => setHasComplaint(e.target.checked)}
            />
            Yes, I want to report an issue
          </label>

          {hasComplaint && (
            <>
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="driver_conduct">Driver behaviour</option>
                  <option value="safety">Safety concern</option>
                  <option value="punctuality">Punctuality</option>
                  <option value="vehicle_condition">Vehicle condition</option>
                  <option value="overcharging">Overcharging</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                What happened?
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    marginTop: 7,
                  }}
                />
              </label>
            </>
          )}
        </div>

        {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}

        <div className="settings-actions">
          <button className="secondary-button" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" onClick={submit} disabled={busy} type="button">
            {busy ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </div>
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
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [tripsRes, memRes] = await Promise.all([
        api.get('/transport/api/my-trips/'),
        api.get('/transport/api/my-memberships/'),
      ]);
      setTrips(tripsRes.data);
      setMemberships(memRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load operator data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <article className="module module-wide">
        <p className="muted">Loading operator data…</p>
      </article>
    );
  }

  if (error) {
    return (
      <article className="module module-wide">
        <p className="danger-button" style={{ display: 'block' }}>{error}</p>
      </article>
    );
  }

  if (selectedTripId) {
    return (
      <OperatorTripDetail
        tripId={selectedTripId}
        onBack={() => { setSelectedTripId(null); load(); }}
        notify={notify}
      />
    );
  }

  return (
    <div className="dashboard-grid">
      <OperatorAlerts notify={notify} />
      <OperatorAnnouncements notify={notify} />
      <OperatorTripsList trips={trips} onSelectTrip={setSelectedTripId} />
      <OperatorFeedback notify={notify} />
      <OperatorMemberships memberships={memberships} />
      <OperatorRequestRank notify={notify} onRequested={load} />

      <article className="module module-wide" style={{ opacity: 0.55 }}>
        <div className="module-heading">
          <span>Complaints</span>
          <span className="module-number">UI preview</span>
        </div>
        <p className="muted">
          Central contribution tier — Section 5.2.3 of the proposal.
        </p>
      </article>
    </div>
  );
}

function OperatorAlerts({ notify }) {
  const [alerts, setAlerts] = useState([]);

  async function load() {
    try {
      const { data } = await api.get('/transport/api/operator/alerts/');
      setAlerts(data);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function acknowledge(id) {
    try {
      await api.post(`/transport/api/operator/alerts/${id}/acknowledge/`);
      notify('Alert acknowledged.');
      load();
    } catch { notify('Failed.'); }
  }

  async function resolve(id) {
    const notes = window.prompt('Resolution notes:');
    if (notes === null) return;
    try {
      await api.post(`/transport/api/operator/alerts/${id}/resolve/`, { notes });
      notify('Alert resolved.');
      load();
    } catch { notify('Failed.'); }
  }

  if (alerts.length === 0) return null;

  return (
    <article
      className="module module-wide"
      style={{ borderColor: 'var(--danger)', borderWidth: 2 }}
    >
      <div className="module-heading">
        <span style={{ color: 'var(--danger)' }}>⚠ ACTIVE PANIC ALERTS</span>
        <span className="module-number">{alerts.length}</span>
      </div>
      {alerts.map((a) => (
        <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <strong>{a.passenger_name} · {a.trip_code}</strong>
          <small style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
            {a.passenger_phone} · {new Date(a.created_at).toLocaleString()}
          </small>
          {a.message && <p className="muted" style={{ marginTop: 6 }}>{a.message}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {a.status === 'active' && (
              <button className="primary-button" onClick={() => acknowledge(a.id)} type="button">
                Acknowledge
              </button>
            )}
            <button className="secondary-button" onClick={() => resolve(a.id)} type="button">
              Mark resolved
            </button>
          </div>
        </div>
      ))}
    </article>
  );
}

function OperatorAnnouncements({ notify }) {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState('');

  async function load() {
    try {
      const [aRes, rRes] = await Promise.all([
        api.get('/transport/api/my-announcements/'),
        api.get('/transport/api/my-trips/'),
      ]);
      setItems(aRes.data);
      // build unique route list from trips
      const seen = new Map();
      rRes.data.forEach((t) => {
        if (!seen.has(t.route.id)) seen.set(t.route.id, t.route);
      });
      setRoutes([...seen.values()]);
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    if (!title.trim() || !body.trim()) { notify('Title and body required.'); return; }
    try {
      await api.post('/transport/api/my-announcements/', {
        title, body, route_id: routeId ? Number(routeId) : null, active: true,
      });
      notify('Announcement published.');
      setTitle(''); setBody(''); setRouteId(''); setShowForm(false);
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to publish.');
    }
  }

  async function deactivate(id) {
    if (!window.confirm('Deactivate this announcement?')) return;
    try {
      await api.delete(`/transport/api/my-announcements/${id}/`);
      notify('Deactivated.');
      load();
    } catch { notify('Failed.'); }
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Announcements</span>
        <span className="module-number">{items.filter(i => i.active).length} active</span>
      </div>
      <p className="muted">Publish service updates. Passengers see these on their dashboard.</p>

      {!showForm && (
        <button className="primary-button" onClick={() => setShowForm(true)} type="button">
          New announcement
        </button>
      )}

      {showForm && (
        <>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Body
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: 10, borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', fontFamily: 'inherit', marginTop: 7,
              }}
            />
          </label>
          <label>
            Link to route (optional)
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">All routes</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.departure.name} → {r.destination.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="secondary-button" onClick={() => setShowForm(false)} type="button">Cancel</button>
            <button className="primary-button" onClick={submit} type="button">Publish</button>
          </div>
        </>
      )}

      {items.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>Published</div>
          {items.map((a) => (
            <div key={a.id} className="trip-row">
              <span>
                <strong>{a.title}</strong>
                <small>
                  {new Date(a.created_at).toLocaleDateString()}
                  {a.route_label ? ` · ${a.route_label}` : ''}
                </small>
              </span>
              {a.active ? (
                <button className="danger-button" onClick={() => deactivate(a.id)} type="button">
                  Deactivate
                </button>
              ) : (
                <span className="status-pill">inactive</span>
              )}
            </div>
          ))}
        </>
      )}
    </article>
  );
}

function OperatorFeedback({ notify }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [filter, setFilter] = useState('all'); // all | complaints | ratings

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/transport/api/operator/feedback/');
      setItems(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function respond(id) {
    if (!responseText.trim()) { notify('Write a response first.'); return; }
    try {
      await api.post(`/transport/api/operator/feedback/${id}/respond/`, {
        operator_response: responseText,
      });
      notify('Response sent. Passenger will see it.');
      setRespondingTo(null);
      setResponseText('');
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to respond.');
    }
  }

  async function escalate(id) {
    if (!window.confirm('Escalate this complaint to admin review?')) return;
    try {
      await api.post(`/transport/api/operator/feedback/${id}/escalate/`);
      notify('Complaint escalated to admin.');
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to escalate.');
    }
  }

  async function acknowledge(id) {
    try {
      await api.post(`/transport/api/operator/feedback/${id}/acknowledge/`);
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to acknowledge.');
    }
  }

  const filtered = items.filter((f) => {
    if (filter === 'complaints') return f.has_complaint;
    if (filter === 'ratings') return !f.has_complaint;
    return true;
  });

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Passenger feedback</span>
        <span className="module-number">{filtered.length}</span>
      </div>

      <div className="role-picker" style={{ marginBottom: 16 }}>
        {['all', 'complaints', 'ratings'].map((f) => (
          <button
            key={f}
            className={filter === f ? 'selected' : ''}
            onClick={() => setFilter(f)}
            type="button"
          >
            {f}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="muted">No feedback yet.</p>}

      {filtered.map((f) => (
        <div key={f.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>
              <strong>{f.trip_code} · {f.rating}★</strong>
              <small style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
                {f.passenger_name} · {f.passenger_phone} · {f.route_label}
              </small>
            </span>
            <span
              className="status-pill"
              style={{
                borderColor: f.status === 'resolved' ? 'var(--success)' :
                             f.status === 'escalated' ? 'var(--danger)' :
                             'var(--accent)',
                color: f.status === 'resolved' ? 'var(--success)' :
                       f.status === 'escalated' ? 'var(--danger)' :
                       'var(--accent)',
              }}
            >
              {f.status_label}
            </span>
          </div>

          {f.has_complaint && (
            <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid var(--accent)' }}>
              <small style={{ opacity: 0.7 }}>{f.category_label}</small>
              <p className="muted" style={{ marginTop: 4 }}>{f.description}</p>
            </div>
          )}

          {f.operator_response && (
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              <em>You replied:</em> {f.operator_response}
            </p>
          )}

          {f.has_complaint && f.status !== 'resolved' && f.status !== 'escalated' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {f.status === 'submitted' && (
                <button className="secondary-button" onClick={() => acknowledge(f.id)} type="button">
                  Mark under review
                </button>
              )}
              <button className="primary-button" onClick={() => { setRespondingTo(f.id); setResponseText(''); }} type="button">
                Respond
              </button>
              <button className="danger-button" onClick={() => escalate(f.id)} type="button">
                Escalate to admin
              </button>
            </div>
          )}

          {respondingTo === f.id && (
            <div style={{ marginTop: 12 }}>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                rows={3}
                placeholder="Write your response…"
                style={{
                  width: '100%', padding: 10, borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="secondary-button" onClick={() => setRespondingTo(null)} type="button">Cancel</button>
                <button className="primary-button" onClick={() => respond(f.id)} type="button">Send response</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </article>
  );
}

function OperatorTripsList({ trips, onSelectTrip }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrips = trips.filter((t) => t.departure_date === today);
  const upcoming = trips.filter((t) => t.departure_date > today);

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>My trips</span>
        <span className="module-number">{trips.length}</span>
      </div>

      {trips.length === 0 && (
        <p className="muted">
          No trips assigned to you. Trips are scheduled by rank admins.
        </p>
      )}

      {todayTrips.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}>Today</div>
          {todayTrips.map((t) => <TripRow key={t.id} trip={t} onClick={() => onSelectTrip(t.id)} />)}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>Upcoming</div>
          {upcoming.map((t) => <TripRow key={t.id} trip={t} onClick={() => onSelectTrip(t.id)} />)}
        </>
      )}
    </article>
  );
}

function TripRow({ trip, onClick }) {
  const statusColor =
    trip.status === 'flagged' ? 'var(--danger)' :
    trip.status === 'boarding' || trip.status === 'in_progress' ? 'var(--success)' :
    trip.status === 'completed' ? 'var(--muted)' :
    'var(--accent)';

  return (
    <button className="trip-row" onClick={onClick} type="button">
      <span>
        <strong>
          {trip.route.departure.name} → {trip.route.destination.name}
        </strong>
        <small>
          {trip.trip_code} · {trip.departure_date}
          {trip.expected_departure_time ? ` · ${trip.expected_departure_time.slice(0, 5)}` : ''}
          {' · '}{trip.seats_taken}/{trip.seat_capacity} seats
        </small>
      </span>
      <span className="status-pill" style={{ borderColor: statusColor, color: statusColor }}>
        {trip.status}
      </span>
    </button>
  );
}

function OperatorMemberships({ memberships }) {
  return (
    <article className="module">
      <div className="module-heading">
        <span>My rank memberships</span>
        <span className="module-number">{memberships.length}</span>
      </div>
      {memberships.length === 0 && (
        <p className="muted">No memberships yet. Request a rank.</p>
      )}
      {memberships.map((m) => (
        <div className="trip-row" key={m.id}>
          <span>
            <strong>{m.rank.name}</strong>
            <small>{m.rank.area}</small>
          </span>
          <span
            className="status-pill"
            style={{
              borderColor: m.status === 'active' ? 'var(--success)' : 'var(--accent)',
              color: m.status === 'active' ? 'var(--success)' : 'var(--accent)',
            }}
          >
            {m.status}
          </span>
        </div>
      ))}
    </article>
  );
}

function OperatorRequestRank({ notify, onRequested }) {
  const [ranks, setRanks] = useState([]);
  const [myRankIds, setMyRankIds] = useState([]);
  const [rankId, setRankId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function loadOptions() {
    try {
      const [rankRes, memRes] = await Promise.all([
        api.get('/transport/api/ranks/'),
        api.get('/transport/api/my-memberships/'),
      ]);
      setRanks(rankRes.data);
      const mine = memRes.data.map((m) => m.rank.id);
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
      notify('Rank request submitted for admin approval.');
      setNotes('');
      setShowForm(false);
      await loadOptions();
      onRequested?.();
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
        Apply to operate at another rank. The rank&apos;s admin reviews and approves.
      </p>

      {!showForm && (
        <button className="secondary-button" onClick={() => setShowForm(true)} type="button">
          Request rank
        </button>
      )}

      {showForm && (
        availableRanks.length === 0 ? (
          <p className="muted">You already have a membership at every rank.</p>
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
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
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

function OperatorTripDetail({ tripId, onBack, notify }) {
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Walk-in form
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInNokName, setWalkInNokName] = useState('');
  const [walkInNokPhone, setWalkInNokPhone] = useState('');
  const [lastWalkInCode, setLastWalkInCode] = useState(null);

  // Verify
  const [verifyingId, setVerifyingId] = useState(null);
  const [lastVerifiedCode, setLastVerifiedCode] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/transport/api/my-trips/${tripId}/manifest/`);
      setTrip(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load trip.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tripId]);

  async function engage() {
    try {
      await api.post(`/transport/api/my-trips/${tripId}/engage/`);
      notify('You are now working this trip.');
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Could not engage trip.');
    }
  }

  async function release() {
    if (!window.confirm('Release this trip? Remaining unverified passengers will be marked no-show.')) return;
    try {
      const { data } = await api.post(`/transport/api/my-trips/${tripId}/release/`);
      notify(`Trip released. ${data.bumped} unverified passenger(s) bumped.`);
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Could not release.');
    }
  }
  async function completeTrip() {
    if (!window.confirm('Complete this trip? Unverified passengers will be marked no-show.')) return;
    try {
      const { data } = await api.post(`/transport/api/my-trips/${tripId}/complete/`);
      notify(`Trip completed. ${data.no_shows} no-show(s) marked, ${data.completed_passengers} passenger(s) can now rate.`);
      onBack();
    } catch (err) {
      notify(err.response?.data?.detail || 'Could not complete trip.');
    }
  }
  async function verifyBooking(bookingId) {
    setVerifyingId(bookingId);
    try {
      const { data } = await api.post(
        `/transport/api/my-trips/${tripId}/bookings/${bookingId}/verify/`
      );
      setLastVerifiedCode({ bookingId, code: data.verification_code });
      notify(`Verified. Code: ${data.verification_code}`);
      if (data.bumped > 0) {
        notify(`Trip full — ${data.bumped} unverified passenger(s) bumped.`);
      }
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Verification failed.');
    } finally {
      setVerifyingId(null);
    }
  }

  async function registerWalkIn() {
    if (!walkInName.trim()) { notify('Name is required.'); return; }
    if (!walkInNokName.trim() || !walkInNokPhone.trim()) {
      notify('Next-of-kin name and phone are required.');
      return;
    }
    try {
      const { data } = await api.post(`/transport/api/my-trips/${tripId}/walk-in/`, {
        name: walkInName,
        phone: walkInPhone,
        next_of_kin_name: walkInNokName,
        next_of_kin_phone: walkInNokPhone,
      });
      setLastWalkInCode({ name: walkInName, code: data.verification_code });
      setWalkInName('');
      setWalkInPhone('');
      setWalkInNokName('');
      setWalkInNokPhone('');
      notify('Walk-in registered. Code issued.');
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Registration failed.');
    }
  }

  if (loading) return <article className="module module-wide"><p className="muted">Loading…</p></article>;
  if (error) return (
    <article className="module module-wide">
      <p className="danger-button" style={{ display: 'block' }}>{error}</p>
      <button className="secondary-button" onClick={onBack} type="button">← Back</button>
    </article>
  );
  if (!trip) return null;

  const engaged = trip.is_engaged;

  // -------- Engage prompt --------
  if (!engaged) {
    return (
      <>
        <article className="module module-wide">
          <div className="module-heading">
            <span>{trip.trip_code}</span>
            <button className="text-button" onClick={onBack} type="button">← Back</button>
          </div>
          <h3 style={{ margin: '8px 0' }}>
            {trip.route.departure.name} → {trip.route.destination.name}
          </h3>
          <div className="route-summary">
            <div><span className="route-label">Date</span><strong>{trip.departure_date}</strong></div>
            <div><span className="route-label">Time</span><strong>{trip.expected_departure_time?.slice(0, 5) || '—'}</strong></div>
            <div><span className="route-label">Driver</span><strong>{trip.driver_name || 'Unassigned'}</strong></div>
            <div><span className="route-label">Vehicle</span><strong>{trip.vehicle_plate || 'Unassigned'}</strong></div>
            <div><span className="route-label">Seats</span><strong>{trip.seats_taken}/{trip.seat_capacity}</strong></div>
            <div><span className="route-label">Status</span><strong>{trip.status}</strong></div>
          </div>
        </article>

        <article className="module module-wide">
          <div className="module-heading"><span>Work this trip?</span></div>
          <p className="muted">
            Engaging locks you to this trip until you release it. You cannot work another
            trip at the same time.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button className="secondary-button" onClick={onBack} type="button">Not now</button>
            <button className="primary-button" onClick={engage} type="button">
              Yes, work this trip
            </button>
          </div>
        </article>
      </>
    );
  }

  // -------- Engaged view --------
  const booked = trip.booked_passengers || [];
  const walkIns = trip.walk_in_passengers || [];
  const isFull = trip.seats_taken >= trip.seat_capacity;

  return (
    <>
      <article className="module module-wide">
        <div className="module-heading">
          <span>{trip.trip_code} · {trip.status.toUpperCase()}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="secondary-button" onClick={onBack} type="button">← Back</button>
            <button className="primary-button" onClick={completeTrip} type="button">
              Complete trip
            </button>
            <button className="danger-button" onClick={release} type="button">
              Release (abandon)
            </button>
          </div>
        </div>
      </article>

      <article className="module module-wide">
        <div className="module-heading">
          <span>Booked passengers (app users)</span>
          <span className="module-number">{booked.length}</span>
        </div>
        {booked.length === 0 && <p className="muted">No bookings yet.</p>}
        {booked.map((b) => (
          <div className="trip-row" key={b.booking_id}>
            <span>
              <strong>{b.name}</strong>
              <small>
                {b.phone}
                {b.verification_code ? ` · code ${b.verification_code}` : ''}
                {b.code_verified ? ' ✓' : ''}
              </small>
            </span>
            {b.status === 'reserved' ? (
              <button
                className="primary-button"
                onClick={() => verifyBooking(b.booking_id)}
                disabled={verifyingId === b.booking_id}
                type="button"
              >
                {verifyingId === b.booking_id ? 'Verifying…' : 'Verify + issue code'}
              </button>
            ) : (
              <span className="status-pill">{b.status}</span>
            )}
          </div>
        ))}
        {lastVerifiedCode && (
          <p className="muted" style={{ marginTop: 12 }}>
            Latest code: <strong>{lastVerifiedCode.code}</strong> — call out the passenger and give it to them.
          </p>
        )}
      </article>

      <article className="module module-wide">
        <div className="module-heading">
          <span>Walk-ins (no app)</span>
          <span className="module-number">{walkIns.length}</span>
        </div>
        <p className="muted">
          Passengers without the app — added to the manifest with a next-of-kin record.
        </p>

        <div className="form-grid">
          <label>
            Name
            <input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
          </label>
          <label>
            Phone (optional)
            <input value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
          </label>
          <label>
            Next of kin — name
            <input value={walkInNokName} onChange={(e) => setWalkInNokName(e.target.value)} />
          </label>
          <label>
            Next of kin — phone
            <input value={walkInNokPhone} onChange={(e) => setWalkInNokPhone(e.target.value)} />
          </label>
        </div>
        <button className="primary-button" onClick={registerWalkIn} disabled={isFull} type="button">
          {isFull ? 'Trip is full' : 'Register + issue code'}
        </button>

        {lastWalkInCode && (
          <p className="muted" style={{ marginTop: 12 }}>
            Latest walk-in code for <strong>{lastWalkInCode.name}</strong>: <strong>{lastWalkInCode.code}</strong>
          </p>
        )}

        {walkIns.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>Registered walk-ins</div>
            {walkIns.map((b) => (
              <div className="trip-row" key={b.booking_id}>
                <span>
                  <strong>{b.name}</strong>
                  <small>
                    NOK: {b.next_of_kin_name} ({b.next_of_kin_phone})
                    {b.verification_code ? ` · code ${b.verification_code}` : ''}
                  </small>
                </span>
                <span className="status-pill">{b.status}</span>
              </div>
            ))}
          </>
        )}
      </article>
    </>
  );
}

function Administrator({ notify }) {
  const [adminInfo, setAdminInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/transport/api/admin/me/');
        setAdminInfo(data);
      } catch {
        setAdminInfo(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <article className="module module-wide"><p className="muted">Loading admin data…</p></article>;
  }

  if (!adminInfo || !adminInfo.rank) {
    return (
      <article className="module module-wide">
        <p className="danger-button" style={{ display: 'block' }}>
          You are not assigned to a rank. Contact a superuser.
        </p>
      </article>
    );
  }

  return (
    <div className="dashboard-grid">
      <article className="module module-wide">
        <div className="module-heading">
          <span>Managing</span>
          <span className="module-number">{adminInfo.rank.name}</span>
        </div>
        <p className="muted">
          Institution: <strong>{adminInfo.institution_name}</strong> · Rank area:{' '}
          <strong>{adminInfo.rank.area}</strong>
        </p>
      </article>

      <AdminMemberships notify={notify} />
      <AdminScheduleTrip notify={notify} />
      <AdminFeedback notify={notify} />
      <AdminFlags notify={notify} />
      <AdminTrips notify={notify} />
    </div>
  );
}

function AdminApplicantModal({ membershipId, onClose, onApprove, onReject }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/transport/api/admin/memberships/${membershipId}/`);
        setData(data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Could not load.');
      }
    })();
  }, [membershipId]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Applicant details</h3>
          <button className="text-button" onClick={onClose} type="button">Close</button>
        </div>

        {error && <p className="danger-button" style={{ display: 'block' }}>{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}

        {data && (
          <>
            <div className="settings-section">
              <div className="section-title">Identity</div>
              <div className="route-summary">
                <div><span className="route-label">Name</span><strong>{data.operator.name}</strong></div>
                <div><span className="route-label">Phone</span><strong>{data.operator.phone}</strong></div>
                <div><span className="route-label">Email</span><strong>{data.operator.email || '—'}</strong></div>
                <div><span className="route-label">Account created</span><strong>{new Date(data.operator.account_created).toLocaleDateString()}</strong></div>
              </div>
            </div>

            <div className="settings-section">
              <div className="section-title">Association</div>
              <div className="route-summary">
                <div><span className="route-label">Code</span><strong>{data.operator.association_code}</strong></div>
                <div><span className="route-label">Name</span><strong>{data.operator.association_name}</strong></div>
              </div>
            </div>

            <div className="settings-section">
              <div className="section-title">Platform history</div>
              <div className="route-summary">
                <div><span className="route-label">Total memberships</span><strong>{data.operator.membership_count}</strong></div>
                <div><span className="route-label">Active memberships</span><strong>{data.operator.active_memberships}</strong></div>
                <div><span className="route-label">Routes served</span><strong>{data.operator.routes_served}</strong></div>
                <div><span className="route-label">Trips operated</span><strong>{data.operator.trips_operated}</strong></div>
              </div>
            </div>

            {data.notes && (
              <div className="settings-section">
                <div className="section-title">Application notes</div>
                <p className="muted">{data.notes}</p>
              </div>
            )}

            <div className="settings-section">
              <div className="section-title">Request</div>
              <p className="muted">
                Requested {new Date(data.requested_at).toLocaleString()}
                {' · '}Rank: <strong>{data.rank.name}</strong>
                {' · '}Status: <strong>{data.status}</strong>
              </p>
            </div>

            <div className="settings-actions">
              <button className="secondary-button" onClick={onClose} type="button">Close</button>
              <button className="danger-button" onClick={() => { onReject(membershipId); onClose(); }} type="button">
                Reject
              </button>
              <button className="primary-button" onClick={() => { onApprove(membershipId); onClose(); }} type="button">
                Approve
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AdminMemberships({ notify }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/transport/api/admin/pending-memberships/');
      setItems(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function approve(id) {
    try {
      await api.post(`/transport/api/admin/memberships/${id}/approve/`);
      notify('Operator approved.');
      load();
    } catch (err) { notify(err.response?.data?.detail || 'Failed.'); }
  }

  async function reject(id) {
    const notes = window.prompt('Reason for rejection (optional):');
    if (notes === null) return;
    try {
      await api.post(`/transport/api/admin/memberships/${id}/reject/`, { notes });
      notify('Operator rejected.');
      load();
    } catch (err) { notify(err.response?.data?.detail || 'Failed.'); }
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Pending operator applications</span>
        <span className="module-number">{items.length}</span>
      </div>
      <p className="muted">Click View details to verify an applicant before deciding.</p>
      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && <p className="muted">No pending applications.</p>}
      {items.map((m) => (
        <div className="trip-row" key={m.id}>
          <span>
            <strong>{m.operator_name}</strong>
            <small>{m.rank.name} · requested {new Date(m.requested_at || Date.now()).toLocaleDateString()}</small>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="secondary-button" onClick={() => setDetailId(m.id)} type="button">View details</button>
            <button className="primary-button" onClick={() => approve(m.id)} type="button">Approve</button>
            <button className="danger-button" onClick={() => reject(m.id)} type="button">Reject</button>
          </div>
        </div>
      ))}

      {detailId && (
        <AdminApplicantModal
          membershipId={detailId}
          onClose={() => setDetailId(null)}
          onApprove={approve}
          onReject={reject}
        />
      )}
    </article>
  );
}

function AdminScheduleTrip({ notify }) {
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [routeId, setRouteId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [capacity, setCapacity] = useState('15');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/transport/api/admin/available-for-rank/');
      setData(data);
      if (data.routes[0]) setRouteId(data.routes[0].id);
      if (data.operators[0]) setOperatorId(data.operators[0].id);
      if (data.drivers[0]) setDriverId(data.drivers[0].id);
      if (data.vehicles[0]) setVehicleId(data.vehicles[0].id);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    if (!routeId || !operatorId || !departureDate) {
      notify('Route, operator and date are required.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/transport/api/admin/schedule-trip/', {
        route_id: Number(routeId),
        operator_id: Number(operatorId),
        departure_date: departureDate,
        expected_departure_time: timeStr || null,
        seat_capacity: Number(capacity) || 15,
        driver_id: driverId ? Number(driverId) : null,
        vehicle_id: vehicleId ? Number(vehicleId) : null,
        notes,
      });
      notify('Trip scheduled and added to the queue.');
      setShowForm(false);
      setDepartureDate(''); setTimeStr(''); setNotes('');
      load();
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to schedule.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <article className="module module-wide"><p className="muted">Loading…</p></article>;
  if (!data) return null;

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Schedule a trip</span>
        <span className="module-number">Adds to queue</span>
      </div>
      <p className="muted">
        Add a new departure from your rank. Trips appear in the queue ordered by time.
      </p>

      {!showForm && (
        <button className="primary-button" onClick={() => setShowForm(true)} type="button">
          Schedule new trip
        </button>
      )}

      {showForm && (
        <>
          <div className="form-grid">
            <label>
              Route
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                {data.routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.departure.name} → {r.destination.name} (R{r.fare})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
                {data.operators.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({o.association})</option>
                ))}
              </select>
            </label>
            <label>
              Departure date
              <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
            </label>
            <label>
              Expected time (optional)
              <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />
            </label>
            <label>
              Seat capacity
              <input type="number" min="1" max="35" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
            <label>
              Driver (optional)
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {data.drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                ))}
              </select>
            </label>
            <label>
              Vehicle (optional)
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate_number} · {v.make} {v.model}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Saturday special" />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="secondary-button" onClick={() => setShowForm(false)} type="button">Cancel</button>
            <button className="primary-button" onClick={submit} disabled={busy} type="button">
              {busy ? 'Scheduling…' : 'Schedule trip'}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function AdminFeedback({ notify }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('escalated');
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseText, setResponseText] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/transport/api/admin/feedback/?scope=${scope}`);
      setItems(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [scope]);

  async function confirm(id) {
    if (!responseText.trim()) { notify('Write a response first.'); return; }
    try {
      await api.post(`/transport/api/admin/feedback/${id}/confirm-incident/`, { admin_response: responseText });
      notify('Confirmed as safety incident.');
      setRespondingTo(null); setResponseText(''); load();
    } catch (err) { notify(err.response?.data?.detail || 'Failed.'); }
  }

  async function dismiss(id) {
    if (!responseText.trim()) { notify('Write a response first.'); return; }
    try {
      await api.post(`/transport/api/admin/feedback/${id}/dismiss/`, { admin_response: responseText });
      notify('Dismissed.');
      setRespondingTo(null); setResponseText(''); load();
    } catch (err) { notify(err.response?.data?.detail || 'Failed.'); }
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Passenger feedback</span>
        <span className="module-number">{items.length}</span>
      </div>

      <div className="role-picker" style={{ marginBottom: 16 }}>
        {[
          { key: 'escalated', label: 'Escalated' },
          { key: 'complaints', label: 'All complaints' },
          { key: 'all', label: 'Everything' },
        ].map((s) => (
          <button
            key={s.key}
            className={scope === s.key ? 'selected' : ''}
            onClick={() => setScope(s.key)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && <p className="muted">No feedback in this view.</p>}
      {items.map((f) => (
        <div key={f.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>
              <strong>{f.trip_code} · {f.rating}★</strong>
              <small style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
                {f.passenger_name} · {f.passenger_phone} · {f.route_label}
              </small>
            </span>
            <span className="status-pill" style={{
              borderColor: f.status === 'resolved' ? 'var(--success)' :
                           f.status === 'confirmed_incident' ? 'var(--danger)' :
                           f.status === 'escalated' ? 'var(--danger)' : 'var(--accent)',
              color: f.status === 'resolved' ? 'var(--success)' :
                     f.status === 'confirmed_incident' ? 'var(--danger)' :
                     f.status === 'escalated' ? 'var(--danger)' : 'var(--accent)',
            }}>
              {f.status_label}
            </span>
          </div>
          {f.has_complaint && (
            <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid var(--accent)' }}>
              <small style={{ opacity: 0.7 }}>{f.category_label}</small>
              <p className="muted" style={{ marginTop: 4 }}>{f.description}</p>
            </div>
          )}
          {f.operator_response && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              <em>Operator said:</em> {f.operator_response}
            </p>
          )}
          {f.admin_response && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13, paddingLeft: 12, borderLeft: '2px solid var(--danger)' }}>
              <em>You said:</em> {f.admin_response}
            </p>
          )}
          {f.has_complaint && (f.status === 'escalated' || f.status === 'under_review' || f.status === 'submitted') && (
            <>
              {respondingTo === f.id ? (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    rows={3}
                    placeholder="Your response to the passenger…"
                    style={{
                      width: '100%', padding: 10, borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      color: 'var(--text)', fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="secondary-button" onClick={() => setRespondingTo(null)} type="button">Cancel</button>
                    <button className="primary-button" onClick={() => confirm(f.id)} type="button">Confirm incident</button>
                    <button className="danger-button" onClick={() => dismiss(f.id)} type="button">Dismiss</button>
                  </div>
                </div>
              ) : (
                <button className="primary-button" style={{ marginTop: 10 }} onClick={() => { setRespondingTo(f.id); setResponseText(''); }} type="button">
                  Review
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </article>
  );
}

function AdminFlags({ notify }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('open');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/transport/api/admin/trip-flags/?scope=${scope}`);
      setItems(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [scope]);

  async function acknowledge(id) {
    try {
      await api.post(`/transport/api/admin/trip-flags/${id}/acknowledge/`);
      notify('Flag acknowledged.');
      load();
    } catch (err) { notify(err.response?.data?.detail || 'Failed.'); }
  }

  async function resolve(id) {
    const notes = window.prompt('Resolution notes:');
    if (notes === null) return;
    try {
      await api.post(`/transport/api/admin/trip-flags/${id}/resolve/`, { notes });
      notify('Flag resolved.');
      load();
    } catch (err) { notify(err.response?.data?.detail || 'Failed.'); }
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Trip flags from operators</span>
        <span className="module-number">{items.length}</span>
      </div>

      <div className="role-picker" style={{ marginBottom: 16 }}>
        {[
          { key: 'open', label: 'Open' },
          { key: 'all', label: 'All' },
        ].map((s) => (
          <button
            key={s.key}
            className={scope === s.key ? 'selected' : ''}
            onClick={() => setScope(s.key)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="muted">Issues operators reported on trips departing from your rank.</p>
      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && <p className="muted">No flags in this view.</p>}
      {items.map((flag) => (
        <div key={flag.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>
              <strong>{flag.category_label}</strong>
              <small style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
                Reported by {flag.flagged_by_name} · {new Date(flag.flagged_at).toLocaleString()}
              </small>
            </span>
            <span className="status-pill" style={{
              borderColor: flag.status === 'resolved' ? 'var(--success)' :
                           flag.status === 'open' ? 'var(--danger)' : 'var(--accent)',
              color: flag.status === 'resolved' ? 'var(--success)' :
                     flag.status === 'open' ? 'var(--danger)' : 'var(--accent)',
            }}>
              {flag.status_label}
            </span>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>{flag.notes}</p>
          {flag.status === 'open' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="secondary-button" onClick={() => acknowledge(flag.id)} type="button">Acknowledge</button>
              <button className="primary-button" onClick={() => resolve(flag.id)} type="button">Resolve</button>
            </div>
          )}
        </div>
      ))}
    </article>
  );
}

function AdminTrips({ notify }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/transport/api/admin/trips/');
      setTrips(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function cancelTrip(id) {
    if (!window.confirm('Cancel this trip? All unboarded passengers will be marked cancelled.')) return;
    try {
      await api.post(`/transport/api/admin/trips/${id}/cancel/`);
      notify('Trip cancelled.');
      load();
    } catch (err) { notify(err.response?.data?.detail || 'Failed.'); }
  }

  return (
    <article className="module module-wide">
      <div className="module-heading">
        <span>Trip management</span>
        <span className="module-number">{trips.length}</span>
      </div>
      <p className="muted">All trips scheduled in the system. Cancel to halt a trip.</p>
      {loading && <p className="muted">Loading…</p>}
      {!loading && trips.length === 0 && <p className="muted">No trips scheduled.</p>}
      {trips.slice(0, 30).map((t) => (
        <div className="trip-row" key={t.id}>
          <span>
            <strong>{t.trip_code} · {t.route.departure.name} → {t.route.destination.name}</strong>
            <small>
              {t.operator_name} · {t.departure_date} · {t.seats_taken}/{t.seat_capacity} seats · {t.status}
            </small>
          </span>
          {t.status !== 'cancelled' && t.status !== 'completed' && (
            <button className="danger-button" onClick={() => cancelTrip(t.id)} type="button">
              Cancel trip
            </button>
          )}
        </div>
      ))}
    </article>
  );
}

export default App;