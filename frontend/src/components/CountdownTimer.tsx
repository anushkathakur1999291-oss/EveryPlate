import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  deadline: string; // ISO string
  pickupVerifiedAt?: string; // ISO string if picked up
  status?: string;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  deadline,
  pickupVerifiedAt,
  status,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [transitElapsed, setTransitElapsed] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const target = new Date(deadline).getTime();
      setTimeLeft(Math.max(0, target - now));

      if (pickupVerifiedAt) {
        const start = new Date(pickupVerifiedAt).getTime();
        setTransitElapsed(Math.max(0, now - start));
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline, pickupVerifiedAt]);

  const isCompleted = status === 'COMPLETED' || status === 'DELIVERED';
  const isExpired = timeLeft === 0 && !isCompleted;

  // Format Stage 1: Remaining shelf-life
  const hours = Math.floor(timeLeft / (3600 * 1000));
  const minutes = Math.floor((timeLeft % (3600 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);

  // Format Stage 2: Transit elapsed
  const transitMinutes = Math.floor(transitElapsed / (60 * 1000));
  const transitSeconds = Math.floor((transitElapsed % (60 * 1000)) / 1000);

  if (isCompleted) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-800 border border-emerald-500/30">
        <span>✓ Rescue Completed</span>
      </span>
    );
  }

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-800 border border-rose-500/30">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Expired</span>
      </span>
    );
  }

  // If already picked up, show Stage 2 In-Transit Timer (Section 20)
  if (pickupVerifiedAt) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-stone-100 text-stone-700 border border-stone-300">
        <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
        <span>In Transit: {transitMinutes}m {transitSeconds}s</span>
      </div>
    );
  }

  // Stage 1: Shelf-life countdown
  const isUrgent = hours < 1;
  const colorClass = isUrgent
    ? 'bg-rose-500/20 text-rose-800 border-rose-500/30 '
    : hours < 2
    ? 'bg-amber-500/20 text-amber-800 border-amber-500/30'
    : 'bg-stone-100 text-stone-700 border-stone-300';

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border ${colorClass}`}>
      <Clock className="w-3.5 h-3.5" />
      <span>
        Expires in: {hours > 0 ? `${hours}h ` : ''}{minutes}m {seconds}s
      </span>
    </div>
  );
};
