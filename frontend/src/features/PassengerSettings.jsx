import { useEffect, useState } from 'react';
import api from '../api';

const fields = [
  ['first_name', 'First name'],
  ['last_name', 'Surname'],
  ['next_of_kin_name', 'Emergency contact name'],
  ['next_of_kin_phone', 'Emergency contact phone'],
  ['second_next_of_kin_name', 'Second contact name (optional)'],
  ['second_next_of_kin_phone', 'Second contact phone (optional)'],
];

export default function PassengerSettings({ onClose, notify }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    api.get('/accounts/api/passenger-settings/')
      .then(({ data }) => { if (current) setProfile(data); })
      .catch(() => { if (current) setError('Sign in to load your account settings.'); });
    return () => { current = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const changes = Object.fromEntries(fields.map(([name]) => [name, profile[name]]));
      const { data } = await api.put('/accounts/api/passenger-settings/', changes);
      notify(data);
      onClose();
    } catch (err) {
      const response = err.response?.data || {};
      setError(Object.values(response).flat().find(value => typeof value === 'string') || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="settings-overlay">
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="passenger-settings-title">
      <div className="settings-header">
        <h3 id="passenger-settings-title">Account settings</h3>
        <button className="text-button" type="button" onClick={onClose} disabled={saving}>Close</button>
      </div>
      {error && <p role="alert" className="pb-error">{error}</p>}
      {!profile && !error && <p role="status">Loading your profile…</p>}
      {profile && <form onSubmit={save}>
        <p>Sign-in phone {profile.phone} · Recovery email {profile.email || 'not set'}</p>
        <div className="settings-grid">
          {fields.map(([name, label]) => <label key={name}>{label}
            <input value={profile[name] || ''} type={name.endsWith('phone') ? 'tel' : 'text'}
              required={!name.startsWith('second_')} maxLength={name.endsWith('phone') ? 16 : 150}
              onChange={event => setProfile({ ...profile, [name]: event.target.value })} />
          </label>)}
        </div>
        <p>New group bookings use these contacts. Existing group bookings keep the saved trip contact.</p>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </form>}
    </section>
  </div>;
}
