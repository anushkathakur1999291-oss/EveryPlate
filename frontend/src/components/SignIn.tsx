import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
export function SignIn() {
  const { login, error: connectionError, users, demoMode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return <main className="auth-page"><form className="auth-form" onSubmit={async e => {
    e.preventDefault(); setPending(true); setError('');
    try { await login(email, password); } catch (err) { setError((err as Error).message); } finally { setPending(false); }
  }}><span className="eyebrow">EveryPlate</span><h1>Good food. A better destination.</h1><p>Sign in to coordinate your next food rescue.</p>
    {(error || connectionError) && <p role="alert" className="form-error">{error || connectionError}</p>}
    {demoMode && users.length > 0 && (
      <div className="flex flex-col gap-3 my-3 p-4 bg-stone-100 rounded-lg border border-stone-200">
        <span className="text-sm font-medium text-stone-600 mb-1">Quick select demo account (Password: <code>adminpassword123</code>):</span>
        {['ADMIN', 'DONOR', 'RECEIVER', 'DRIVER'].map(role => {
          const roleUsers = users.filter(u => u.role === role);
          if (roleUsers.length === 0) return null;
          return (
            <div key={role} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{role}S</span>
              <div className="flex flex-wrap gap-1.5">
                {roleUsers.map(user => {
                  let displayName = user.name;
                  if (role === 'DONOR' && user.donorProfile?.organizationName) {
                    displayName = `${user.donorProfile.organizationName} (${user.name})`;
                  } else if (role === 'RECEIVER' && user.receiverProfile?.organizationName) {
                    displayName = `${user.receiverProfile.organizationName} (${user.name})`;
                  } else if (role === 'DRIVER' && user.driverProfile?.fullName) {
                    displayName = user.driverProfile.fullName;
                  }
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => { setEmail(user.email); setPassword('adminpassword123'); }}
                      className="px-2 py-1.5 text-xs bg-white hover:bg-stone-50 border border-stone-300 rounded shadow-xs text-stone-700 cursor-pointer text-left transition-colors"
                    >
                      {displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    )}
    <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
    <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
    <button className="primary-button" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button><p className="text-sm">Accounts are provided by your organization coordinator.</p>
  </form></main>;
}
