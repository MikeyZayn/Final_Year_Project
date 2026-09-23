import { useCallback, useEffect, useState } from 'react';
import { api, clearSession, getApiBase, getToken, getUser, setApiBase, setSession } from './api';
import PassengerMapDashboard from './pages/PassengerMapDashboard.jsx';
import DriverPage from './pages/DriverPage.jsx';
import OperatorPage from './pages/OperatorPage.jsx';

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
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
    } catch (e) {
      setHealth({ status: 'down', error: e.message });
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [apiBase, refreshHealth]);

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

  function saveApiBase(e) {
    e.preventDefault();
    setApiBase(apiBase);
    notify(`API base → ${apiBase}`);
    refreshHealth();
  }

  if (!token || !user) {
    return (
      <div className="shell">
        <header className="top">
          <div>
            <div className="eyebrow">THEMBA host UI</div>
            <h1>Sign in</h1>
          </div>
          <span className={`pill ${health?.status === 'ok' ? 'ok' : 'bad'}`}>
            API {health?.status === 'ok' ? 'online' : 'offline'}
          </span>
        </header>

        <form className="card" onSubmit={saveApiBase}>
          <label>
            API base URL (use host LAN IP on second device)
            <input
              value={apiBase}
              onChange={(e) => setApiBaseState(e.target.value)}
              placeholder="http://192.168.x.x:8000/api"
            />
          </label>
          <button type="submit" className="secondary">
            Save API URL
          </button>
          <p className="muted small">
            Device 1 (host): <code>http://127.0.0.1:8000/api</code>
            <br />
            Device 2: <code>http://&lt;HOST_LAN_IP&gt;:8000/api</code>
          </p>
        </form>

        <form className="card" onSubmit={handleLogin}>
          <label>
            Username / phone / email
            <input value={ident} onChange={(e) => setIdent(e.target.value)} autoComplete="username" />
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
          <div className="demo-row">
            {DEMOS.map((d) => (
              <button
                key={d.ident}
                type="button"
                className="chip"
                onClick={() => {
                  setIdent(d.ident);
                  setPassword('themba123');
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="muted small">Password for demos: <code>themba123</code></p>
        </form>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  const role = user.role === 'administrator' ? 'admin' : user.role;

  return (
    <div className="shell">
      <header className="top">
        <div>
          <div className="eyebrow">{role} · {user.phone || user.email || user.username}</div>
          <h1>
            {user.first_name} {user.last_name}
          </h1>
        </div>
        <div className="top-actions">
          <span className={`pill ${health?.status === 'ok' ? 'ok' : 'bad'}`}>
            {getApiBase().replace(/^https?:\/\//, '')}
          </span>
          <button type="button" className="secondary" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {role === 'passenger' && (
        <PassengerMapDashboard notify={notify} onExit={handleLogout} />
      )}
      {role === 'driver' && <DriverPage notify={notify} />}
      {(role === 'operator' || role === 'admin') && (
        <OperatorPage notify={notify} isAdmin={role === 'admin'} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
