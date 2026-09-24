import React, { useRef, useState, useEffect } from 'react';
import { ROLES, RoleConfig } from './rolesData';
import { ArrowUpRight } from 'lucide-react';

interface RoleCarouselProps {
  progress: number;
  activeIndex: number;
  onSelectIndex: (index: number) => void;
  onConfirmRole: (role: RoleConfig) => void;
  isFormOpen: boolean;
}

export const RoleCarousel: React.FC<RoleCarouselProps> = ({
  progress,
  activeIndex,
  onSelectIndex,
  onConfirmRole,
  isFormOpen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const [isLargeScreen, setIsLargeScreen] = useState(true);

  useEffect(() => {
    const checkScreen = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isLargeScreen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMouseOffset({ x, y });
  };

  const handleMouseLeave = () => {
    setMouseOffset({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full h-[320px] sm:h-[390px] lg:h-[530px] flex items-center justify-center select-none overflow-visible"
      style={{ perspective: '1400px', transformStyle: 'preserve-3d' }}
    >
      {ROLES.map((role, i) => {
        const diff = i - progress;
        const absDiff = Math.abs(diff);
        const isActive = i === activeIndex;

        // Responsive spatial transformations:
        // Desktop uses full editorial 3D arc; mobile uses tucked 3D depth to prevent content overlap
        const translateY = isLargeScreen ? diff * 150 : diff * 35;
        const translateX = isLargeScreen ? diff * (diff > 0 ? -28 : 28) : diff * (diff > 0 ? -12 : 12);
        const translateZ = -absDiff * (isLargeScreen ? 140 : 100);
        const rotateX = diff * -7 + (isActive && isLargeScreen ? mouseOffset.y * -6 : 0);
        const rotateY = (isLargeScreen ? diff * 12 : diff * 5) + (isActive && isLargeScreen ? mouseOffset.x * 8 : 0);
        const scale = Math.max(0.72, 1 - absDiff * (isLargeScreen ? 0.16 : 0.12));
        const opacity = Math.max(0, 1 - absDiff * (isLargeScreen ? 0.52 : 0.65));
        const zIndex = 30 - Math.round(absDiff * 10);
        const blur = isLargeScreen ? Math.min(absDiff * 3, 5) : Math.min(absDiff * 2, 4);

        if (absDiff > 2.2) return null;

        return (
          <div
            key={role.id}
            onClick={() => {
              if (isActive && !isFormOpen) {
                onConfirmRole(role);
              } else {
                onSelectIndex(i);
              }
            }}
            tabIndex={isActive ? 0 : -1}
            role="button"
            aria-label={`Select ${role.name} role`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isActive) onConfirmRole(role);
                else onSelectIndex(i);
              }
            }}
            className={`absolute cursor-pointer will-change-transform rounded-2xl overflow-hidden bg-stone-900 border border-stone-200/80 dark:border-stone-700/60 shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isActive
                ? 'ring-1 ring-stone-900/10 dark:ring-emerald-500/30 shadow-[0_32px_70px_-15px_rgba(28,25,23,0.18),0_12px_28px_-8px_rgba(28,25,23,0.08)] dark:shadow-[0_32px_70px_-15px_rgba(0,0,0,0.7),0_0_30px_rgba(16,185,129,0.15)]'
                : 'shadow-[0_15px_35px_-10px_rgba(28,25,23,0.1)] dark:shadow-[0_15px_35px_-10px_rgba(0,0,0,0.4)] hover:opacity-85'
            }`}
            style={{
              width: 'min(94%, 520px)',
              height: isLargeScreen ? '410px' : 'min(90%, 320px)',
              transform: `translate3d(${translateX}px, ${translateY}px, ${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
              opacity,
              zIndex,
              filter: blur > 0.4 ? `blur(${blur}px)` : 'none',
              transformStyle: 'preserve-3d',
              transition: 'box-shadow 0.3s ease, filter 0.15s ease',
            }}
          >
            {/* Visual Background Image */}
            <div className="relative w-full h-full overflow-hidden bg-stone-100 dark:bg-stone-900">
              <img
                src={role.image}
                alt={role.name}
                loading={i <= 1 ? 'eager' : 'lazy'}
                className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
                  isActive ? 'scale-100 hover:scale-[1.03]' : 'scale-105 saturate-[0.85]'
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/25 to-transparent pointer-events-none" />

              {/* Card Header Pill */}
              <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 flex items-center justify-between pointer-events-none">
                <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-medium tracking-wider uppercase bg-white/90 dark:bg-stone-900/90 backdrop-blur-md text-stone-800 dark:text-stone-200 shadow-xs border border-white/60 dark:border-stone-700/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  {role.index} · {role.name}
                </span>

                <span className="hidden sm:inline-flex text-[11px] font-mono tracking-widest text-white/80 bg-stone-950/40 backdrop-blur-md px-2.5 py-0.5 rounded-full">
                  {role.id}
                </span>
              </div>


              {/* Card Bottom Content */}
              <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 text-white flex items-end justify-between gap-3 pointer-events-none">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase tracking-widest text-stone-300 font-mono mb-0.5 sm:mb-1 truncate">
                    {role.tagline}
                  </p>
                  <h3 className="text-lg sm:text-2xl font-semibold tracking-tight text-white drop-shadow-xs truncate">
                    {role.demoAccount.organization}
                  </h3>
                </div>

                <div className="shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white transition-colors">
                  <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
