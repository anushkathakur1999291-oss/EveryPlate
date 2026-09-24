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
    <div className="flex flex-col gap-1.5 my-3 p-3 bg-stone-100 rounded-lg border border-stone-200">
      <span className="text-xs font-medium text-stone-600">Quick select demo account (Password: <code>adminpassword123</code>):</span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => { setEmail('admin@surplustoshelter.org'); setPassword('adminpassword123'); }} className="px-2 py-1 text-xs bg-white hover:bg-stone-50 border border-stone-300 rounded shadow-xs text-stone-700 cursor-pointer">Admin</button>
        <button type="button" onClick={() => { setEmail('marco@greenbistro.com'); setPassword('adminpassword123'); }} className="px-2 py-1 text-xs bg-white hover:bg-stone-50 border border-stone-300 rounded shadow-xs text-stone-700 cursor-pointer">Donor (Marco)</button>
        <button type="button" onClick={() => { setEmail('director@hopeshelter.org'); setPassword('adminpassword123'); }} className="px-2 py-1 text-xs bg-white hover:bg-stone-50 border border-stone-300 rounded shadow-xs text-stone-700 cursor-pointer">Receiver (Mary)</button>
        <button type="button" onClick={() => { setEmail('alex.rivera@rescue.org'); setPassword('adminpassword123'); }} className="px-2 py-1 text-xs bg-white hover:bg-stone-50 border border-stone-300 rounded shadow-xs text-stone-700 cursor-pointer">Driver (Alex)</button>
      </div>
    </div>
    <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
    <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
    <button className="primary-button" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button><p className="text-sm">Accounts are provided by your organization coordinator.</p>
  </form></main>;
}
