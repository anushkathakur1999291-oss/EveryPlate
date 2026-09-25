import React, { lazy, Suspense } from 'react';
import { SignIn } from './components/SignIn';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
const DonorPortal = lazy(() => import('./features/donor/DonorPortal').then(m => ({ default: m.DonorPortal })));
const ReceiverPortal = lazy(() => import('./features/receiver/ReceiverPortal').then(m => ({ default: m.ReceiverPortal })));
const DriverPortal = lazy(() => import('./features/driver/DriverPortal').then(m => ({ default: m.DriverPortal })));
const AdminPortal = lazy(() => import('./features/admin/AdminPortal').then(m => ({ default: m.AdminPortal })));
import { NotificationToast } from './components/NotificationToast';

const AppContent: React.FC = () => {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-[#121413] text-stone-600 dark:text-stone-300 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span>Opening your workspace…</span>
        </div>
      </div>
    );
  }

  if (!currentUser) return <SignIn />;
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-[#121413] dark:text-stone-100 flex flex-col font-sans transition-colors duration-200">
      <Navbar />
      <NotificationToast />
      <main id="main-content" className="flex-1" key={currentUser.id}><Suspense fallback={<div role="status" className="p-8">Loading your workspace…</div>}>
        {currentUser?.role === 'DONOR' && <DonorPortal />}
        {currentUser?.role === 'RECEIVER' && <ReceiverPortal />}
        {currentUser?.role === 'DRIVER' && <DriverPortal />}
        {currentUser?.role === 'ADMIN' && <AdminPortal />}
      </Suspense></main>
      <footer className="border-t border-stone-200 dark:border-stone-800/80 py-6 text-center text-xs text-stone-500 dark:text-stone-400">
        Annsave · Good food, delivered with care
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <AppContent />
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

