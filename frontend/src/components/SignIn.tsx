import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLES, RoleConfig } from './auth/rolesData';
import { RoleCarousel } from './auth/RoleCarousel';
import { RoleDetails } from './auth/RoleDetails';
import { AuthForm } from './auth/AuthForm';
import { ThemeToggle } from './ThemeToggle';
import { ShieldCheck, ChevronUp, ChevronDown } from 'lucide-react';


export function SignIn() {
  const { login, error: connectionError } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // References for animation loop
  const currentProgressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const wheelLockRef = useRef<number>(0);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Prefers reduced motion
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Smooth lerp loop for physical 3D momentum
  useEffect(() => {
    targetProgressRef.current = targetIndex;

    const animate = () => {
      if (prefersReducedMotion.current) {
        currentProgressRef.current = targetProgressRef.current;
        setProgress(targetProgressRef.current);
        return;
      }

      const diff = targetProgressRef.current - currentProgressRef.current;
      if (Math.abs(diff) > 0.001) {
        // Smooth exponential damping
        currentProgressRef.current += diff * 0.12;
        setProgress(currentProgressRef.current);
        rafIdRef.current = requestAnimationFrame(animate);
      } else {
        currentProgressRef.current = targetProgressRef.current;
        setProgress(targetProgressRef.current);
        rafIdRef.current = null;
      }
    };

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [targetIndex]);

  // Navigate to specific index
  const goToIndex = useCallback((newIndex: number) => {
    const clamped = Math.max(0, Math.min(ROLES.length - 1, newIndex));
    setTargetIndex(clamped);
    setActiveIndex(clamped);
  }, []);

  // Handle Wheel / Trackpad scrolling
  const handleWheel = useCallback((e: WheelEvent) => {
    // If the user is typing in an input or the form is open and scrolled, don't hijack wheel
    if (isFormOpen && (e.target as HTMLElement)?.closest('form')) {
      return;
    }

    const now = Date.now();
    if (now - wheelLockRef.current < 280) {
      e.preventDefault();
      return;
    }

    if (Math.abs(e.deltaY) > 22 || Math.abs(e.deltaX) > 22) {
      e.preventDefault();
      wheelLockRef.current = now;
      const direction = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? Math.sign(e.deltaY) : Math.sign(e.deltaX);

      setTargetIndex((prev) => {
        const next = Math.max(0, Math.min(ROLES.length - 1, prev + direction));
        setActiveIndex(next);
        return next;
      });
    }
  }, [isFormOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      goToIndex(activeIndex + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      goToIndex(activeIndex - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!isFormOpen) {
        e.preventDefault();
        setIsFormOpen(true);
      }
    } else if (e.key === 'Escape') {
      if (isFormOpen) {
        e.preventDefault();
        setIsFormOpen(false);
      }
    }
  }, [activeIndex, isFormOpen, goToIndex]);

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null || touchStartXRef.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartYRef.current = null;
    touchStartXRef.current = null;

    if (Math.abs(deltaY) > 40 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY < 0) goToIndex(activeIndex + 1);
      else goToIndex(activeIndex - 1);
    } else if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) goToIndex(activeIndex + 1);
      else goToIndex(activeIndex - 1);
    }
  };

  useEffect(() => {
    const mainEl = document.getElementById('auth-scroll-container');
    if (mainEl) {
      mainEl.addEventListener('wheel', handleWheel, { passive: false });
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (mainEl) mainEl.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleWheel, handleKeyDown]);

  // Instant demo login handler
  const handleInstantDemo = async (role: RoleConfig) => {
    setIsAuthenticating(true);
    try {
      await login(role.demoAccount.email, 'adminpassword123');
    } catch {
      // If error, open the form so the user can see error & retry
      setIsFormOpen(true);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Standard form submit handler
  const handleFormSubmit = async (email: string, pass: string) => {
    await login(email, pass);
  };

  const currentRole = ROLES[activeIndex];

  return (
    <div
      id="auth-scroll-container"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen w-full bg-[#FAF8F5] dark:bg-[#101211] text-stone-900 dark:text-stone-100 flex flex-col justify-between overflow-x-hidden font-sans relative selection:bg-emerald-800 selection:text-white transition-colors duration-200"
    >
      {/* Editorial Topline Header */}
      <header className="w-full px-6 sm:px-10 lg:px-14 py-6 flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800/80 z-40 bg-[#FAF8F5]/80 dark:bg-[#101211]/85 backdrop-blur-md sticky top-0 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-stone-900 dark:bg-emerald-950 text-white flex items-center justify-center shadow-xs border border-stone-800 dark:border-emerald-700/40">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-stone-900 dark:text-white leading-none">
              Surplus to Shelter
            </h1>
            <span className="text-[10px] font-mono tracking-widest text-stone-500 dark:text-stone-400 uppercase">
              Metropolitan Recovery Protocol
            </span>
          </div>
        </div>

        {/* Center/Right Status & Progress */}
        <div className="flex items-center gap-4 sm:gap-6">
          <ThemeToggle />
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-stone-500 dark:text-stone-400">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>Network Active</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-semibold tracking-wider text-stone-900 dark:text-stone-200">
              {currentRole.index} / 04
            </span>
            <div className="flex gap-1">
              {ROLES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToIndex(i)}
                  aria-label={`Jump to role ${i + 1}`}
                  className={`h-1.5 transition-all duration-300 rounded-full cursor-pointer ${
                    i === activeIndex
                      ? 'w-6 bg-stone-900 dark:bg-emerald-400'
                      : 'w-2 bg-stone-300 dark:bg-stone-700 hover:bg-stone-400 dark:hover:bg-stone-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Exhibition Stage */}
      <main className="flex-1 flex items-center justify-center w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: 3D Visual Carousel (7 cols on desktop) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center relative">
            <RoleCarousel
              progress={progress}
              activeIndex={activeIndex}
              onSelectIndex={goToIndex}
              onConfirmRole={() => setIsFormOpen(true)}
              isFormOpen={isFormOpen}
            />

            {/* Stepper Controls on desktop */}
            <div className="hidden sm:flex items-center gap-3 mt-4 text-xs font-mono text-stone-500 dark:text-stone-400 z-30">
              <button
                type="button"
                onClick={() => goToIndex(activeIndex - 1)}
                disabled={activeIndex === 0}
                aria-label="Previous role"
                className="p-1.5 rounded-full border border-stone-300 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <span>Scroll or drag to navigate roles</span>
              <button
                type="button"
                onClick={() => goToIndex(activeIndex + 1)}
                disabled={activeIndex === ROLES.length - 1}
                aria-label="Next role"
                className="p-1.5 rounded-full border border-stone-300 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer text-stone-700 dark:text-stone-300"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Role Details or Integrated Form (5 cols on desktop) */}
          <div className="lg:col-span-5 flex items-center justify-center relative z-30">
            {isFormOpen ? (
              <AuthForm
                role={currentRole}
                onBack={() => setIsFormOpen(false)}
                onSubmit={handleFormSubmit}
                externalError={connectionError}
              />
            ) : (
              <RoleDetails
                activeIndex={activeIndex}
                onSelectIndex={goToIndex}
                onOpenForm={() => setIsFormOpen(true)}
                onInstantDemo={handleInstantDemo}
                isAuthenticating={isAuthenticating}
              />
            )}
          </div>
        </div>
      </main>

      {/* Editorial Baseline Footer */}
      <footer className="w-full px-6 sm:px-10 lg:px-14 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-stone-200/60 dark:border-stone-800/80 text-[11px] font-mono text-stone-500 dark:text-stone-400 z-40 bg-[#FAF8F5]/80 dark:bg-[#101211]/85 backdrop-blur-md transition-colors duration-200">
        <div className="flex items-center gap-4">
          <span>Surplus to Shelter · Dual Fulfillment Protocol</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Authoritative Capacityautorouting</span>
        </div>
        <div>
          <span>Default demo password: <strong className="text-stone-700 dark:text-stone-200">adminpassword123</strong></span>
        </div>
      </footer>
    </div>
  );
}

