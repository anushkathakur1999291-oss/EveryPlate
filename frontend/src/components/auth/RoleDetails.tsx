import React from 'react';
import { ROLES, RoleConfig } from './rolesData';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

interface RoleDetailsProps {
  activeIndex: number;
  onSelectIndex: (index: number) => void;
  onOpenForm: (role: RoleConfig) => void;
  onInstantDemo: (role: RoleConfig) => void;
  isAuthenticating: boolean;
}

export const RoleDetails: React.FC<RoleDetailsProps> = ({
  activeIndex,
  onSelectIndex,
  onOpenForm,
  onInstantDemo,
  isAuthenticating,
}) => {
  const currentRole = ROLES[activeIndex];

  return (
    <div className="w-full max-w-xl flex flex-col justify-center px-2 sm:px-6 lg:px-8 py-4 sm:py-6 select-none">
      {/* Editorial Navigation List: Clean 4-column grid for zero overflow */}
      <nav aria-label="Role selector" className="grid grid-cols-4 gap-2 pb-3 border-b border-stone-200/80 dark:border-stone-800/80 mb-5 sm:mb-8 w-full">
        {ROLES.map((role, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={role.id}
              onClick={() => onSelectIndex(idx)}
              className={`group flex flex-col sm:flex-row items-center sm:items-baseline justify-center sm:justify-start gap-0.5 sm:gap-2 pb-2 text-center sm:text-left transition-all duration-300 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xs cursor-pointer ${
                isActive
                  ? 'text-stone-900 dark:text-stone-100 opacity-100'
                  : 'text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 opacity-60 hover:opacity-100'
              }`}
            >
              <span className={`font-mono text-[10px] sm:text-[11px] tracking-wider transition-colors ${
                isActive ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-400 dark:text-stone-500 group-hover:text-stone-600 dark:group-hover:text-stone-300'
              }`}>
                {role.index}
              </span>
              <span className={`text-[11px] sm:text-sm tracking-tight font-medium uppercase truncate ${
                isActive ? 'font-semibold text-stone-950 dark:text-white' : 'font-normal'
              }`}>
                {role.name}
              </span>
              {isActive && (
                <span className="absolute bottom-0 inset-x-0 h-[2px] bg-stone-900 dark:bg-emerald-400 animate-in fade-in duration-300" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Role Narrative Content */}
      <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300 key={currentRole.id}">
        {/* Kicker & Index */}
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-5 h-[1.5px] bg-emerald-600 dark:bg-emerald-400" />
          <span className="text-[11px] font-mono tracking-widest text-emerald-800 dark:text-emerald-400 uppercase font-medium">
            {currentRole.kicker}
          </span>
        </div>

        {/* Primary Role Name */}
        <div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-stone-900 dark:text-white leading-tight">
            {currentRole.name}
          </h2>
          <p className="text-xs sm:text-sm font-mono tracking-wide text-stone-500 dark:text-stone-400 mt-1">
            {currentRole.tagline}
          </p>
        </div>

        {/* Poetic Quote */}
        <blockquote className="text-base sm:text-xl text-stone-800 dark:text-stone-200 font-serif italic border-l-2 border-stone-300 dark:border-stone-700 pl-3.5 sm:pl-4 py-0.5 sm:py-1 leading-relaxed">
          &ldquo;{currentRole.quote}&rdquo;
        </blockquote>

        {/* Narrative Description */}
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed max-w-lg">
          {currentRole.description}
        </p>

        {/* Capabilities Tags */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1">
          {currentRole.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium bg-stone-100 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border border-stone-200/80 dark:border-stone-700/60"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              {tag}
            </span>
          ))}
        </div>

        {/* Key Operational Metrics */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 py-2.5 sm:py-3 border-y border-stone-200/70 dark:border-stone-800/80 text-stone-800 dark:text-stone-200">
          {currentRole.stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-[10px] sm:text-[11px] font-mono tracking-wider text-stone-500 dark:text-stone-400 uppercase">
                {stat.label}
              </div>
              <div className="text-xs sm:text-base font-semibold text-stone-900 dark:text-stone-100 mt-0.5">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Action Triggers */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => onOpenForm(currentRole)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-stone-900 dark:bg-emerald-600 text-white font-medium text-sm hover:bg-stone-800 dark:hover:bg-emerald-500 active:scale-[0.99] transition-all duration-200 shadow-md shadow-stone-900/10 dark:shadow-emerald-950/40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
          >
            <span>Continue to Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={isAuthenticating}
            onClick={() => onInstantDemo(currentRole)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 active:scale-[0.99] text-stone-800 dark:text-stone-200 font-medium text-xs border border-stone-200/80 dark:border-stone-700 transition-all duration-200 cursor-pointer disabled:opacity-50"
            title={`Instant sign in as ${currentRole.demoAccount.name}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Demo: {currentRole.demoAccount.name}</span>
          </button>
        </div>
      </div>

    </div>
  );
};
