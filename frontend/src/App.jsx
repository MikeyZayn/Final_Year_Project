import { useCallback, useEffect, useState } from 'react';
import { api, clearSession, getApiBase, getToken, getUser, setApiBase, setSession } from './api';
import PassengerMapDashboard from './pages/PassengerMapDashboard.jsx';
import DriverPage from './pages/DriverPage.jsx';
import OperatorPage from './pages/OperatorPage.jsx';

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
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
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
                <input name="name" value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
              </label>
              <label>
                Phone number
                <input name="phone" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} />
              </label>
              <label>
                Email address
                <input name="email" type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} />
              </label>
              <label>
                Home area
                <input name="homeArea" value={form.homeArea} onChange={(e) => updateForm('homeArea', e.target.value)} />
              </label>
              <label>
                Emergency contact
                <input name="emergencyContact" value={form.emergencyContact} onChange={(e) => updateForm('emergencyContact', e.target.value)} />
              </label>
              <label>
                Emergency contact number
                <input name="emergencyContactNumber" type="tel" value={form.emergencyContactNumber} onChange={(e) => updateForm('emergencyContactNumber', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">Security</div>
            <div className="settings-grid single-column">
              <label>
                Current password
                <input name="password" type="password" value={form.password} onChange={(e) => updateForm('password', e.target.value)} />
              </label>
              <label>
                New password
                <input name="newPassword" type="password" value={form.newPassword} onChange={(e) => updateForm('newPassword', e.target.value)} />
              </label>
              <label>
                Confirm password
                <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={(e) => updateForm('confirmPassword', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">Notifications</div>
            <div className="checkbox-stack">
              <label className="checkbox-row">
                <input type="checkbox" checked={form.emailAlerts} onChange={(e) => updateForm('emailAlerts', e.target.checked)} />
                Email alerts
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.smsAlerts} onChange={(e) => updateForm('smsAlerts', e.target.checked)} />
                SMS alerts
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.pushAlerts} onChange={(e) => updateForm('pushAlerts', e.target.checked)} />
                Push notifications
              </label>
            </div>
          </div>

          <div className="settings-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button">Save changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const DEMOS = [
  { label: 'Passenger', ident: 'passenger_demo' },
  { label: 'Driver', ident: 'driver_demo' },
  { label: 'Operator', ident: 'operator_demo' },
  { label: 'Admin', ident: 'admin_demo' },
];

export default function App() {
  const [user, setUser] = useState(getUser());
  const [token, setToken] = useState(getToken());
  const [ident, setIdent] = useState('passenger_demo');
  const [password, setPassword] = useState('themba123');
  const apiBase = getApiBase();
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  async function handleLogin(e) {
    e?.preventDefault();
    setBusy(true);
    try {
      setApiBase(apiBase);
      const data = await api.login(ident, password);
      setSession(data.token, data.user);
      setToken(data.token);
      setUser(data.user);
      notify(`Signed in as ${data.user.role}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    api.logout().catch(() => {});
    clearSession();
    setToken(null);
    setUser(null);
    notify('Signed out');
  }

  function LandingPage() {
    return (
      <div className="app dark">
        <div className="landing-shell">
        <header className="landing-topbar">
          <div className="landing-brand">
            <span className="landing-brand-mark">T</span>
            <span>
              <strong>THEMBA</strong>
              <small>Transport Hub with Evaluated Mobility, Boarding &amp; Accountability</small>
            </span>
          </div>
        </header>

        <div className="landing-page">
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

            <div className="feature-strip">
              <span>01 / Route clarity</span>
              <span>02 / Trip verification</span>
              <span>03 / Accountable feedback</span>
            </div>
          </div>

          <div className="auth-panel" id="signin-card">
            <form onSubmit={handleLogin}>
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
                <input value={ident} onChange={(e) => setIdent(e.target.value)} autoComplete="username" />
              </label>

              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </label>

              <button type="submit" className="primary-button full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>

              <p className="muted small">Demo password: <strong>themba123</strong></p>
            </form>

          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <LandingPage />;
  }

  const role = user.role === 'administrator' ? 'admin' : user.role;

  return (
    <div className="app dark">
      <div className="shell">
      <header className="top">
        <div>
          <div className="eyebrow">{role} · {user.phone || user.email || user.username}</div>
          <h1>
            {user.first_name} {user.last_name}
          </h1>
        </div>
        <div className="top-actions">
          <button type="button" className="secondary-button" onClick={() => setSettingsOpen(true)}>
            Profile Settings
          </button>
          <button type="button" className="secondary" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {settingsOpen && <ProfileSettingsModal user={user} onClose={() => setSettingsOpen(false)} notify={notify} />}

      {role === 'passenger' && (
        <PassengerMapDashboard notify={notify} />
      )}
      {role === 'driver' && <DriverPage notify={notify} />}
      {(role === 'operator' || role === 'admin') && (
        <OperatorPage notify={notify} isAdmin={role === 'admin'} />
      )}

      {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
