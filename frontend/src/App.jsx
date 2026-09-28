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
import RankFlowOperatorPage from './pages/RankFlowOperatorPage.jsx';
import RankFlowAdminPage from './pages/RankFlowAdminPage.jsx';
import './styles/operatorFyp.css';

const DEMOS = [
  { label: 'Passenger', ident: 'passenger_demo' },
  { label: 'Driver', ident: 'driver_demo' },
  { label: 'Operator', ident: 'operator_demo' },
  { label: 'Admin', ident: 'admin_demo' },
];

const ROLES = ['passenger', 'driver', 'operator'];

export default function App() {
  const [user, setUser] = useState(getUser());
  const [token, setToken] = useState(getToken());
  const [screen, setScreen] = useState('welcome'); // welcome | login | register
  const [role, setRole] = useState('passenger');
  const [darkMode, setDarkMode] = useState(true);
  const [toast, setToast] = useState('');
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [health, setHealth] = useState(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
    } catch (e) {
      setHealth({ status: 'down', error: e.message });
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [apiBase, refreshHealth]);

  function handleLogout() {
    api.logout().catch(() => {});
    clearSession();
    setToken(null);
    setUser(null);
    setScreen('welcome');
    notify('Signed out');
  }

  function handleAuthed(data) {
    setSession(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    notify(`Signed in as ${data.user.role}`);
  }

  // ——— Logged in: full-bleed role dashboards ———
  if (token && user) {
    const r = user.role === 'administrator' ? 'admin' : user.role;
    return (
      <>
        {r === 'passenger' && (
          <PassengerMapDashboard notify={notify} onExit={handleLogout} />
        )}
        {r === 'driver' && <DriverPage notify={notify} />}
        {r === 'operator' && <RankFlowOperatorPage notify={notify} />}
        {r === 'admin' && <RankFlowAdminPage notify={notify} />}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  }

  // ——— Auth shell (FYP welcome / login / register — no guest) ———
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
          <button
            className="text-button"
            type="button"
            onClick={() => setDarkMode((v) => !v)}
          >
            {darkMode ? 'Light mode' : 'Dark mode'}
          </button>
          <span className={`status-pill ${health?.status === 'ok' ? '' : ''}`}>
            API {health?.status === 'ok' ? 'online' : 'offline'}
          </span>
        </div>
      </header>

      <main className="page-shell">
        {screen === 'welcome' && (
          <Welcome
            onLogin={() => setScreen('login')}
            onRegister={() => {
              setRole('passenger');
              setScreen('register');
            }}
          />
        )}

        {screen === 'login' && (
          <Login
            apiBase={apiBase}
            setApiBaseState={setApiBaseState}
            onBack={() => setScreen('welcome')}
            onAuthed={handleAuthed}
            notify={notify}
          />
        )}

        {screen === 'register' && (
          <Register
            role={role}
            setRole={setRole}
            apiBase={apiBase}
            setApiBaseState={setApiBaseState}
            onBack={() => setScreen('welcome')}
            onAuthed={handleAuthed}
            notify={notify}
          />
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Welcome({ onLogin, onRegister }) {
  return (
    <section className="welcome-panel">
      <div className="eyebrow">South African transport information platform</div>
      <h1>
        Travel information.
        <br />
        <em>Verified trips.</em>
        <br />
        Safer journeys.
      </h1>
      <p className="lead">
        Find the right route, understand the fare, and connect every completed trip to
        accountable passenger feedback.
      </p>
      <div className="welcome-actions">
        <button className="primary-button" onClick={onLogin} type="button">
          Sign in <span>→</span>
        </button>
        <button className="secondary-button" onClick={onRegister} type="button">
          Create an account
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

function Login({ apiBase, setApiBaseState, onBack, onAuthed, notify }) {
  const [ident, setIdent] = useState('passenger_demo');
  const [password, setPassword] = useState('themba123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError('');
    if (!ident || !password) {
      setError('Username / phone / email and password are required.');
      return;
    }
    setBusy(true);
    try {
      setApiBase(apiBase);
      const data = await api.login(ident.trim(), password);
      onAuthed(data);
    } catch (err) {
      setError(err.message || 'Login failed.');
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
      <p className="muted">Sign in with your phone, email, or demo username.</p>

      <label>
        API base URL
        <input
          value={apiBase}
          onChange={(e) => setApiBaseState(e.target.value)}
          placeholder="http://127.0.0.1:8000/api"
        />
      </label>

      <label>
        Phone / email / username
        <input
          value={ident}
          onChange={(e) => setIdent(e.target.value)}
          placeholder="passenger_demo or 082…"
          autoComplete="username"
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
        <p className="muted" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <div className="demo-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
        {DEMOS.map((d) => (
          <button
            key={d.ident}
            type="button"
            className="secondary-button"
            style={{ minWidth: 0, padding: '8px 12px', fontSize: 12 }}
            onClick={() => {
              setIdent(d.ident);
              setPassword('themba123');
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <button
        className="primary-button full"
        onClick={handleSubmit}
        type="button"
        disabled={busy}
      >
        {busy ? 'Signing in…' : (
          <>
            Sign in <span>→</span>
          </>
        )}
      </button>
      <button className="secondary-button full" onClick={onBack} type="button">
        Back to welcome
      </button>
    </section>
  );
}

function Register({ role, setRole, apiBase, setApiBaseState, onBack, onAuthed, notify }) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    password: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    second_next_of_kin_name: '',
    second_next_of_kin_phone: '',
    license_number: '',
    rank_code: '',
    id_number: '',
  });
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
      setApiBase(apiBase);
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
          second_next_of_kin_name: form.second_next_of_kin_name || '',
          second_next_of_kin_phone: form.second_next_of_kin_phone || '',
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
          id_number: form.id_number || undefined,
        });
      } else if (role === 'operator') {
        data = await api.registerOperator({
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          email: form.email || undefined,
          password: form.password,
          rank_code: form.rank_code,
        });
      } else {
        setError('Administrator accounts are created by invitation only.');
        setBusy(false);
        return;
      }
      onAuthed(data);
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
        Passenger accounts are active immediately. Driver accounts may require verification.
        Administrator accounts are invitation-only.
      </p>

      <label>
        API base URL
        <input
          value={apiBase}
          onChange={(e) => setApiBaseState(e.target.value)}
          placeholder="http://127.0.0.1:8000/api"
        />
      </label>

      <div className="role-picker">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={role === r ? 'selected' : ''}
            onClick={() => setRole(r)}
          >
            {r}
          </button>
        ))}
      </div>

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

      <label>
        Password
        <input
          type="password"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
        />
      </label>

      {role === 'passenger' && (
        <>
          <label>
            Next of kin — name
            <input
              value={form.next_of_kin_name}
              onChange={(e) => set('next_of_kin_name', e.target.value)}
            />
          </label>
          <label>
            Next of kin — phone
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
            Licence number
            <input
              value={form.license_number}
              onChange={(e) => set('license_number', e.target.value)}
            />
          </label>
          <label>
            Rank / association code (optional)
            <input value={form.rank_code} onChange={(e) => set('rank_code', e.target.value)} />
          </label>
        </>
      )}

      {role === 'operator' && (
        <label>
          Association rank code (required)
          <input
            value={form.rank_code}
            onChange={(e) => set('rank_code', e.target.value)}
            placeholder="e.g. KDL001"
          />
        </label>
      )}

      {error && (
        <p className="muted" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <button
        className="primary-button full"
        onClick={handleSubmit}
        type="button"
        disabled={busy}
      >
        {busy ? 'Creating account…' : (
          <>
            Create account <span>→</span>
          </>
        )}
      </button>
      <button className="secondary-button full" onClick={onBack} type="button">
        Back to welcome
      </button>
    </section>
  );
}