import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
export function SignIn() {
  const { login, error: connectionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return <main className="auth-page"><form className="auth-form" onSubmit={async e => {
    e.preventDefault(); setPending(true); setError('');
    try { await login(email, password); } catch (err) { setError((err as Error).message); } finally { setPending(false); }
  }}><span className="eyebrow">Surplus to Shelter</span><h1>Good food. A better destination.</h1><p>Sign in to coordinate your next food rescue.</p>
    {(error || connectionError) && <p role="alert" className="form-error">{error || connectionError}</p>}
    <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
    <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
    <button className="primary-button" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button><p className="text-sm">Accounts are provided by your organization coordinator.</p>
  </form></main>;
}
