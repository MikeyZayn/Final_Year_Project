import { useEffect, useState } from 'react';

const roles = ['passenger', 'driver', 'operator', 'administrator'];

const demoUsers = {
  passenger: 'Sibusiso Dlamini',
  driver: 'Bongani Mthembu',
  operator: 'Nqobile Zondi',
  administrator: 'THEMBA Administrator',
};

const trips = [
  {
    id: 'TH-EMP-001',
    route: 'Empangeni to Durban',
    departure: '07:30',
    fare: 'R85',
    status: 'Scheduled',
    duration: '3h 20m',
    origin: 'Empangeni',
    destination: 'Durban',
    eta: '10:50',
  },
  {
    id: 'TH-EMP-002',
    route: 'Empangeni to Richards Bay',
    departure: '09:00',
    fare: 'R35',
    status: 'Boarding',
    duration: '1h 15m',
    origin: 'Empangeni',
    destination: 'Richards Bay',
    eta: '10:15',
  },
];

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
  const [activeTrip, setActiveTrip] = useState(trips[0]);
  const [darkMode, setDarkMode] = useState(true);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState(getProfileDefaults('passenger'));
  const [settingsOpen, setSettingsOpen] = useState(false);

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
            onSubmit={() => enterDashboard()}
            onDemo={() => notify(`Demo credentials loaded for ${role}.`)}
          />
        )}

        {screen === 'register' && (
          <Register
            role={role}
            setRole={setRole}
            onBack={() => setScreen('welcome')}
            onSubmit={() => notify('Registration recorded. Driver and operator accounts require administrator approval.')}
          />
        )}

        {screen === 'dashboard' && (
          <Dashboard role={role} activeTrip={activeTrip} setActiveTrip={setActiveTrip} notify={notify} />
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

function Login({ role, setRole, onBack, onSubmit, onDemo }) {
  return (
    <section className="auth-panel">
      <button className="back-link" onClick={onBack} type="button">← Back</button>
      <div className="eyebrow">Secure access</div>
      <h2>Welcome back.</h2>
      <p className="muted">Choose your role to open the relevant dashboard.</p>

      <RolePicker role={role} setRole={setRole} />

      <label>
        Phone number or email
        <input placeholder="name@domain.co.za" />
      </label>

      <label>
        Password
        <input type="password" placeholder="Your password" />
      </label>

      <button className="primary-button full" onClick={onSubmit} type="button">
        Sign in <span>→</span>
      </button>
      <button className="secondary-button full" onClick={onDemo} type="button">
        Load demo credentials
      </button>
    </section>
  );
}

function Register({ role, setRole, onBack, onSubmit }) {
  return (
    <section className="auth-panel">
      <button className="back-link" onClick={onBack} type="button">← Back</button>
      <div className="eyebrow">Account registration</div>
      <h2>Join THEMBA.</h2>
      <p className="muted">Passenger access is immediate. Driver and operator accounts require review.</p>

      <RolePicker role={role} setRole={setRole} />

      <div className="form-grid">
        <label>
          First name
          <input placeholder="First name" />
        </label>
        <label>
          Surname
          <input placeholder="Surname" />
        </label>
      </div>

      <label>
        Cellphone number
        <input placeholder="082 123 4567" />
      </label>

      {role === 'driver' && (
        <>
          <label>
            Driver license number
            <input placeholder="License number" />
          </label>
          <label>
            Association/rank code
            <input placeholder="Rank code" />
          </label>
        </>
      )}

      {role === 'operator' && (
        <label>
          Operator code
          <input placeholder="Operator code" />
        </label>
      )}

      {role === 'administrator' && (
        <label>
          Administrator code
          <input placeholder="Administrator code" />
        </label>
      )}

      <label>
        Password
        <input type="password" placeholder="8+ characters, uppercase and digit" />
      </label>

      <button className="primary-button full" onClick={onSubmit} type="button">
        Submit registration <span>→</span>
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

function Dashboard({ role, activeTrip, setActiveTrip, notify }) {
  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">{role} dashboard</div>
          <h2>{demoUsers[role]}</h2>
        </div>
        <span className="status-pill">Verified workspace</span>
      </div>

      {role === 'passenger' && <Passenger activeTrip={activeTrip} setActiveTrip={setActiveTrip} notify={notify} />}
      {role === 'driver' && <Driver notify={notify} />}
      {role === 'operator' && <Operator notify={notify} />}
      {role === 'administrator' && <Administrator notify={notify} />}
    </section>
  );
}

function Passenger({ activeTrip, setActiveTrip, notify }) {
  const [verificationCode, setVerificationCode] = useState('');

  function verifyTripCode() {
    const cleanedCode = verificationCode.trim();
    if (!cleanedCode) {
      notify('Enter a verification code first.');
      return;
    }

    const matchedTrip = trips.find(
      (trip) => trip.id.toLowerCase() === cleanedCode.toLowerCase()
    );

    if (!matchedTrip) {
      notify('Verification code not found. Please check the route code.');
      return;
    }

    setActiveTrip(matchedTrip);
    setVerificationCode(matchedTrip.id);
    notify(`Route ${matchedTrip.route} unlocked.`);
  }

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
              <input placeholder="Empangeni" />
            </label>
            <label>
              Destination
              <input placeholder="Durban" />
            </label>
          </div>

          <button className="primary-button" onClick={() => notify('2 matching trips found.')} type="button">
            Search trips <span>→</span>
          </button>
        </article>

        <article className="module">
          <div className="module-heading">
            <span>Verification code</span>
            <span className="module-number">02</span>
          </div>

          <input
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            placeholder="Enter code, e.g. TH-EMP-001"
          />
          <button className="secondary-button" onClick={verifyTripCode} type="button">
            Verify trip
          </button>
        </article>
      </div>

      <div className="module">
        <div className="module-heading">
          <span>Available trips</span>
          <span className="module-number">03</span>
        </div>

        {trips.map((trip) => (
          <button
            className={activeTrip?.id === trip.id ? 'trip-row active' : 'trip-row'}
            key={trip.id}
            onClick={() => {
              setActiveTrip(trip);
              setVerificationCode(trip.id);
            }}
            type="button"
          >
            <span>
              <strong>{trip.route}</strong>
              <small>
                {trip.id} · {trip.departure} · {trip.status}
              </small>
            </span>
            <b>{trip.fare}</b>
          </button>
        ))}
      </div>

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

      {activeTrip && (
        <div className="module route-map-panel">
          <div className="module-heading">
            <span>Route preview</span>
            <span className="module-number">{activeTrip.id}</span>
          </div>

          <div className="route-map">
            <svg viewBox="0 0 360 180" aria-label={`${activeTrip.route} route map`}>
              <defs>
                <linearGradient id="routeGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="#f3bf5d" />
                  <stop offset="100%" stopColor="#e3a441" />
                </linearGradient>
              </defs>
              <path d="M42 120 C 110 95, 120 70, 170 90 S 255 110, 318 48" className="route-path" />
              <circle className="route-start" cx="42" cy="120" r="8" />
              <circle className="route-end" cx="318" cy="48" r="8" />
              <circle className="route-mid" cx="170" cy="90" r="6" />
            </svg>
          </div>

          <div className="route-summary">
            <div>
              <span className="route-label">From</span>
              <strong>{activeTrip.origin}</strong>
            </div>
            <div>
              <span className="route-label">To</span>
              <strong>{activeTrip.destination}</strong>
            </div>
            <div>
              <span className="route-label">Departure</span>
              <strong>{activeTrip.departure}</strong>
            </div>
            <div>
              <span className="route-label">ETA</span>
              <strong>{activeTrip.eta}</strong>
            </div>
          </div>
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
                {trip.id} · {trip.departure}
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
      <article className="module module-wide">
        <div className="module-heading">
          <span>Active trip engagement</span>
          <span className="module-number">One at a time</span>
        </div>
        <p className="muted">
          Search active trips, claim one engagement, verify its driver and vehicle, then register passengers.
        </p>
        <button className="primary-button" onClick={() => notify('Trip TH-EMP-002 is now assigned to your active operator session.')} type="button">
          Engage trip TH-EMP-002 <span>→</span>
        </button>
      </article>

      <article className="module">
        <div className="module-heading">
          <span>Complaints</span>
          <span className="module-number">04 open</span>
        </div>
        <p className="muted">Review complaints first and escalate unresolved safety concerns to the administrator.</p>
        <button className="secondary-button" onClick={() => notify('Complaint review opened.')} type="button">
          Review complaints
        </button>
      </article>

      <article className="module">
        <div className="module-heading">
          <span>Verification</span>
          <span className="module-number">Ready</span>
        </div>
        <p className="muted">
          Assigned driver: Bongani Mthembu
          <br />
          Vehicle: Toyota Quantum ND 123-456
        </p>
        <button className="secondary-button" onClick={() => notify('Passenger registration and code generation opened.')} type="button">
          Register passenger
        </button>
      </article>
    </div>
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
