import React, { useState, useEffect } from 'react';
import { useSocketEvent } from '../context/SocketContext';
import { CheckCircle2, Award, X } from 'lucide-react';

interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'PICKUP' | 'DELIVERY';
}

export const NotificationToast: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useSocketEvent('PICKUP_VERIFIED', (delivery: any) => {
    const newToast: Toast = {
      id: Math.random().toString(),
      title: 'Food Collected • Custody Transferred',
      message: `Pickup OTP verified for Delivery #${delivery.id.slice(0, 8)}. Transit timer initiated.`,
      type: 'PICKUP',
    };
    setToasts((prev) => [newToast, ...prev].slice(0, 3));
  });

  useSocketEvent('DELIVERY_VERIFIED', (data: any) => {
    const delivery = { id: data.deliveryId };
    const newToast: Toast = {
      id: Math.random().toString(),
      title: '🎉 Food Successfully Rescued!',
      message: `Delivery #${delivery?.id?.slice(0, 8)} verified. Verified rescue recorded.`,
      type: 'DELIVERY',
    };
    setToasts((prev) => [newToast, ...prev].slice(0, 3));
  });

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(0, -1));
    }, 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div role="status" aria-live="polite" className="fixed top-20 right-5 z-[2000] space-y-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto max-w-sm w-full p-4 rounded-lg shadow-none border  flex items-start gap-3 transform transition-all duration-300 animate-slide-in ${
            toast.type === 'DELIVERY'
              ? 'bg-stone-50 border-stone-300 text-stone-700'
              : 'bg-emerald-50 border-emerald-500/40 text-emerald-800'
          }`}
        >
          {toast.type === 'DELIVERY' ? (
            <Award className="w-5 h-5 text-stone-700 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
          )}

          <div className="flex-1 text-xs">
            <div className="font-bold text-sm text-stone-950 mb-0.5">{toast.title}</div>
            <div className="text-stone-700 leading-relaxed">{toast.message}</div>
          </div>

          <button
            aria-label="Dismiss notification"
            onClick={() => removeToast(toast.id)}
            className="text-stone-600 hover:text-stone-950 transition p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
