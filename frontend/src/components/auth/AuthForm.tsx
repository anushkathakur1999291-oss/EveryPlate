import React, { useState } from 'react';
import { RoleConfig } from './rolesData';
import { Eye, EyeOff, ArrowLeft, ArrowRight, Lock, Mail, Loader2, Sparkles, AlertCircle } from 'lucide-react';

interface AuthFormProps {
  role: RoleConfig;
  onBack: () => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  externalError?: string;
}

export const AuthForm: React.FC<AuthFormProps> = ({
  role,
  onBack,
  onSubmit,
  externalError,
}) => {
  const [email, setEmail] = useState(role.demoAccount.email);
  const [password, setPassword] = useState('adminpassword123');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }
    setLocalError('');
    setIsSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrefill = () => {
    setEmail(role.demoAccount.email);
    setPassword('adminpassword123');
    setLocalError('');
  };

  const activeError = localError || externalError;

  return (
    <div className="w-full max-w-md mx-auto px-4 sm:px-6 py-6 select-none animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors mb-6 group focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-xs cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
        <span>Return to roles</span>
      </button>

      {/* Role Context Header */}
      <div className="space-y-1.5 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono tracking-widest text-emerald-800 dark:text-emerald-400 uppercase font-semibold">
            {role.index} · {role.name} Access
          </span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-white">
          Sign in to your {role.name.toLowerCase()} workspace
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
          {role.demoAccount.organization} · Authorized Personnel
        </p>
      </div>

      {/* Quick Prefill Banner */}
      <div className="mb-5 p-3 rounded-xl bg-stone-100/90 dark:bg-stone-800/80 border border-stone-200/80 dark:border-stone-700/60 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-stone-700 dark:text-stone-300 min-w-0">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="truncate">
            Demo: <strong className="font-semibold text-stone-900 dark:text-stone-100">{role.demoAccount.name}</strong> ({role.demoAccount.email})
          </span>
        </div>
        <button
          type="button"
          onClick={handlePrefill}
          className="shrink-0 font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-2 cursor-pointer text-xs"
        >
          Prefill
        </button>
      </div>

      {/* Error display */}
      {activeError && (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{activeError}</span>
        </div>
      )}

      {/* The Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div>
          <label
            htmlFor="auth-email"
            className="block text-xs font-medium text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5"
          >
            Email address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400 dark:text-stone-500">
              <Mail className="w-4 h-4" />
            </div>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@organization.com"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 text-stone-900 dark:text-white text-sm placeholder:text-stone-400 dark:placeholder:text-stone-500 shadow-xs focus:outline-none focus:border-stone-900 dark:focus:border-emerald-500 focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 transition-colors"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300 uppercase tracking-wider"
            >
              Password
            </label>
            <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500">Default: adminpassword123</span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400 dark:text-stone-500">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 text-stone-900 dark:text-white text-sm placeholder:text-stone-400 dark:placeholder:text-stone-500 shadow-xs focus:outline-none focus:border-stone-900 dark:focus:border-emerald-500 focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors focus:outline-none cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-stone-900 dark:bg-emerald-600 hover:bg-stone-800 dark:hover:bg-emerald-500 active:scale-[0.99] text-white font-medium text-sm transition-all duration-200 shadow-md shadow-stone-900/10 dark:shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating…</span>
              </>
            ) : (
              <>
                <span>Sign in as {role.name}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Security & Organization note */}
        <p className="text-[11px] text-center text-stone-500 dark:text-stone-400 pt-2 leading-relaxed">
          Cryptographically encrypted session · Access restricted to verified rescue partners
        </p>
      </form>
    </div>
  );
};

