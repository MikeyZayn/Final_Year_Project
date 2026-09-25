import { useCallback, useEffect, useState } from 'react';
import {
  api,
  clearSession,
  getApiBase,
  getToken,
  getUser,
  setApiBase,
  setSession,
} from './api';
import PassengerMapDashboard from './pages/PassengerMapDashboard.jsx';
import DriverPage from './pages/DriverPage.jsx';
import OperatorPage from './pages/OperatorPage.jsx';

/* ============================================================
   Register component (own page)
   ============================================================ */

const REGISTER_ROLES = ['passenger', 'driver', 'operator', 'administrator'];

function RegisterRolePicker({ role, setRole }) {
  return (
    <div className="role-picker">
      {REGISTER_ROLES.map((item) => (
        <button
          key={item}
          type="button"
          className={role === item ? 'selected' : ''}
          onClick={() => setRole(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function Register({ role, setRole, onBack, onAuthed }) {
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    setError('');
    if (role === 'administrator') {
      setError('Administrator accounts are created by invitation only.');
      return;
    }
    if (!form.phone || !form.password) {
      setError('Phone number and password are required.');
      return;
    }

    setBusy(true);
    try {
      let data;
      if (role === 'passenger') {
        data = await api.registerPassenger({
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          email: form.email || undefined,
          password: form.password,
          next_of_kin_name: form.next_of_kin_name,
          next_of_kin_phone: form.next_of_kin_phone,
        });
      } else if (role === 'driver') {
        data = await api.registerDriver({
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          email: form.email || undefined,
          password: form.password,
          license_number: form.license_number,
          rank_code: form.rank_code || undefined,
        });
      } else if (role === 'operator') {
        data = await api.registerOperator({
          phone: form.phone,
          email: form.email || undefined,
          password: form.password,
          rank_code: form.rank_code,
        });
      } else {
        throw new Error('Unsupported role.');
      }
      onAuthed(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <button className="back-link" onClick={onBack} type="button">
        ← Back
      </button>
      <div className="eyebrow">Account registration</div>
      <h2>Join THEMBA.</h2>
      <p className="muted">
        Passenger accounts are active immediately. Driver accounts require operator approval.
      </p>

      <RegisterRolePicker role={role} setRole={setRole} />

      {role !== 'operator' && role !== 'administrator' && (
        <div className="form-grid-2">
          <label>
            First name
            <input
              value={form.first_name}
              onChange={(e) => set('first_name', e.target.value)}
            />
          </label>
          <label>
            Surname
            <input
              value={form.last_name}
              onChange={(e) => set('last_name', e.target.value)}
            />
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
              onChange={(e) => set('rank_code', e.target.value.toUpperCase())}
              placeholder="e.g. KDL001"
            />
          </label>
        </>
      )}

      {role === 'operator' && (
        <label>
          Association rank code
          <input
            value={form.rank_code}
            onChange={(e) => set('rank_code', e.target.value.toUpperCase())}
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

/* ============================================================
   Login component (own page)
   ============================================================ */

const DEMOS = [
  { label: 'Passenger', ident: 'passenger_demo' },
  { label: 'Driver', ident: 'driver_demo' },
  { label: 'Operator', ident: 'operator_demo' },
  { label: 'Admin', ident: 'admin_demo' },
];

function Login({ onBack, onCreateAccount, onAuthed, notify }) {
  const [ident, setIdent] = useState('passenger_demo');
  const [password, setPassword] = useState('themba123');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api.login(ident, password);
      onAuthed(data.user, data.token);
      notify?.(`Signed in as ${data.user.role}`);
    } catch (err) {
      notify?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <button className="back-link" onClick={onBack} type="button">
        ← Back
      </button>
      <div className="eyebrow">Secure access</div>
      <h2>Welcome back.</h2>
      <p className="muted">Choose your role to open the relevant dashboard.</p>

      <div className="role-picker">
        {DEMOS.map((d) => (
          <button
            key={d.ident}
            type="button"
            className={ident === d.ident ? 'selected' : ''}
            onClick={() => {
              setIdent(d.ident);
              setPassword('themba123');
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <label>
        Username / phone / email
        <input
          value={ident}
          onChange={(e) => setIdent(e.target.value)}
          autoComplete="username"
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      <button
        type="submit"
        className="primary-button full"
        disabled={busy}
        onClick={handleSubmit}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="muted small">
        Demo password: <strong>themba123</strong>
      </p>

      <button
        type="button"
        className="secondary-button full"
        style={{ marginTop: 8 }}
        onClick={onCreateAccount}
      >
        Create an account
      </button>
    </section>
  );
}

/* ============================================================
   Profile settings modal
   ============================================================ */

function ProfileSettingsModal({ user, onClose, notify }) {
  const [form, setForm] = useState({
    name: [user?.first_name, user?.last_name].filter(Boolean).join(' '),
    phone: user?.phone || '',
    email: user?.email || '',
    homeArea: 'Empangeni',
    emergencyContact: 'Nandi Dlamini',
    emergencyContactNumber: '082 123 4567',
    password: '',
    newPassword: '',
    confirmPassword: '',
    emailAlerts: true,
    smsAlerts: true,
    pushAlerts: false,
  });

  useEffect(() => {
    setForm({
      name: [user?.first_name, user?.last_name].filter(Boolean).join(' '),
      phone: user?.phone || '',
      email: user?.email || '',
      homeArea: 'Empangeni',
      emergencyContact: 'Nandi Dlamini',
      emergencyContactNumber: '082 123 4567',
      password: '',
      newPassword: '',
      confirmPassword: '',
      emailAlerts: true,
      smsAlerts: true,
      pushAlerts: false,
    });
  }, [user]);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave(e) {
    e.preventDefault();
    notify?.('Profile settings saved.');
    onClose();
  }

  const initials = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div>
            <div className="eyebrow">Profile</div>
            <h3>Settings</h3>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="avatar-card">
          <div className="avatar-badge">{initials || 'T'}</div>
          <div>
            <strong>{form.name || user?.username || 'THEMBA rider'}</strong>
            <small>{user?.email || user?.phone || 'Passenger profile'}</small>
          </div>
          <button type="button" className="secondary-button">Change photo</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="settings-section first-section">
            <div className="section-title">Personal details</div>
            <div className="settings-grid">
              <label>
                Full name
                <input
                  name="name"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                />
              </label>
              <label>
                Phone number
                <input
                  name="phone"
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                />
              </label>
              <label>
                Home area
                <input
                  name="homeArea"
                  value={form.homeArea}
                  onChange={(e) => updateForm('homeArea', e.target.value)}
                />
              </label>
              <label>
                Emergency contact
                <input
                  name="emergencyContact"
                  value={form.emergencyContact}
                  onChange={(e) => updateForm('emergencyContact', e.target.value)}
                />
              </label>
              <label>
                Emergency contact number
                <input
                  name="emergencyContactNumber"
                  type="tel"
                  value={form.emergencyContactNumber}
                  onChange={(e) => updateForm('emergencyContactNumber', e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">Security</div>
            <div className="settings-grid single-column">
              <label>
                Current password
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm('password', e.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  value={form.newPassword}
                  onChange={(e) => updateForm('newPassword', e.target.value)}
                />
              </label>
              <label>
                Confirm password
                <input
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => updateForm('confirmPassword', e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">Notifications</div>
            <div className="checkbox-stack">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.emailAlerts}
                  onChange={(e) => updateForm('emailAlerts', e.target.checked)}
                />
                Email alerts
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.smsAlerts}
                  onChange={(e) => updateForm('smsAlerts', e.target.checked)}
                />
                SMS alerts
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.pushAlerts}
                  onChange={(e) => updateForm('pushAlerts', e.target.checked)}
                />
                Push notifications
              </label>
            </div>
          </div>

          <div className="settings-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">Save changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   Landing hero page (standalone)
   ============================================================ */

function LandingPage({ onSignIn, onCreateAccount }) {
  return (
    <div className="app dark">
      <div className="landing-shell">
        <header className="landing-topbar">
          <div className="landing-brand">
            <span className="landing-brand-mark">T</span>
            <span>
              <strong>THEMBA</strong>
              <small>
                Transport Hub with Evaluated Mobility, Boarding &amp; Accountability
              </small>
            </span>
          </div>
        </header>

        <div className="landing-page landing-page--hero">
          <div className="welcome-panel">
            <span className="eyebrow">South African transport information platform</span>
            <h1>
              Travel information.<br />
              <em>Verified trips.</em><br />
              Safer journeys.
            </h1>
            <p className="lead">
              Find the right route, understand the fare, and connect every completed trip to
              accountable passenger feedback.
            </p>

            <div className="welcome-actions">
              <button
                type="button"
                className="primary-button"
                onClick={onCreateAccount}
              >
                Create an account <span>→</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={onSignIn}
              >
                Sign in
              </button>
            </div>

            <div className="feature-strip">
              <span>01 / Route clarity</span>
              <span>02 / Trip verification</span>
              <span>03 / Accountable feedback</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Auth page wrapper (login or register, centred)
   ============================================================ */

function AuthPage({ children }) {
  return (
    <div className="app dark">
      <div className="landing-shell">
        <header className="landing-topbar">
          <div className="landing-brand">
            <span className="landing-brand-mark">T</span>
            <span>
              <strong>THEMBA</strong>
              <small>
                Transport Hub with Evaluated Mobility, Boarding &amp; Accountability
              </small>
            </span>
          </div>
        </header>

        <div className="landing-page landing-page--auth">
          <div className="auth-slot">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   App root
   ============================================================ */

export default function App() {
  const [user, setUser] = useState(getUser());
  const [token, setToken] = useState(getToken());
  const apiBase = getApiBase();
  const [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Simple page router: 'landing' | 'login' | 'register'
  const [page, setPage] = useState('landing');
  const [registerRole, setRegisterRole] = useState('passenger');

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  function handleAuthed(newUser, newToken) {
    setSession(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    api.logout().catch(() => {});
    clearSession();
    setToken(null);
    setUser(null);
    setPage('landing');
    notify('Signed out');
  }

  /* ---- Unauthenticated: route between landing / login / register ---- */

  if (!token || !user) {
    if (page === 'login') {
      return (
        <>
          <AuthPage>
            <Login
              onBack={() => setPage('landing')}
              onCreateAccount={() => setPage('register')}
              onAuthed={handleAuthed}
              notify={notify}
            />
          </AuthPage>
          {toast && <div className="toast">{toast}</div>}
        </>
      );
    }

    if (page === 'register') {
      return (
        <>
          <AuthPage>
            <Register
              role={registerRole}
              setRole={setRegisterRole}
              onBack={() => setPage('landing')}
              onAuthed={handleAuthed}
            />
          </AuthPage>
          {toast && <div className="toast">{toast}</div>}
        </>
      );
    }

    return (
      <>
        <LandingPage
          onSignIn={() => {
            setPage('login');
          }}
          onCreateAccount={() => {
            setRegisterRole('passenger');
            setPage('register');
          }}
        />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  /* ---- Authenticated: dashboard shell ---- */

  const role = user.role === 'administrator' ? 'admin' : user.role;

  return (
    <div className="app dark">
      <div className="shell">
        <header className="top">
          <div>
            <div className="eyebrow">
              {role} · {user.phone || user.email || user.username}
            </div>
            <h1>
              {user.first_name} {user.last_name}
            </h1>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setSettingsOpen(true)}
            >
              Profile Settings
            </button>
            <button type="button" className="secondary" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        {settingsOpen && (
          <ProfileSettingsModal
            user={user}
            onClose={() => setSettingsOpen(false)}
            notify={notify}
          />
        )}

        {role === 'passenger' && <PassengerMapDashboard notify={notify} />}
        {role === 'driver' && <DriverPage notify={notify} />}
        {(role === 'operator' || role === 'admin') && (
          <OperatorPage notify={notify} isAdmin={role === 'admin'} />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}