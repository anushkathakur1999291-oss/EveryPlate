import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, Role } from '../types';
import { api, setApiUserId } from '../services/api';
interface AuthContextType {
  users: User[]; currentUser: User | null; setCurrentUser: (user: User) => void;
  switchRole: (role: Role) => void; isLoading: boolean; refreshUsers: () => Promise<void>;
  demoMode: boolean; error: string; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const setCurrentUser = async (user: User) => {
    const version = ++sequence.current;
    setApiUserId(user.id);
    setIsLoading(true);
    try {
      const profile = await api.getMe();
      if (version !== sequence.current) return;
      setCurrentUserState(profile); localStorage.setItem('demo-user-id', profile.id); setError('');
    } catch (err) { if (version === sequence.current) { setCurrentUserState(null); setError((err as Error).message); } }
    finally { if (version === sequence.current) setIsLoading(false); }
  };
  const refreshUsers = async () => {
    const version = sequence.current;
    try { const profile = await api.getMe(); if (version === sequence.current) setCurrentUserState(profile); }
    catch (err) { setError((err as Error).message); }
  };
  useEffect(() => {
    (async () => {
      try {
        const config = await api.getAuthConfig(); setDemoMode(config.demoMode);
        if (config.demoMode) {
          const directory = await api.getUsers(); setUsers(directory);
          const selected = directory.find(u => u.id === localStorage.getItem('demo-user-id')) || directory.find(u => u.role === 'DONOR') || directory[0];
          if (selected) await setCurrentUser(selected);
          else setError('No demo accounts are available. Run the demo seed on a separate database.');
        } else {
          try { setCurrentUserState(await api.getMe()); } catch { setCurrentUserState(null); }
        }
      } catch (err) { setError((err as Error).message); }
      finally { setIsLoading(false); }
    })();
  }, []);
  const login = async (email: string, password: string) => {
    await api.login(email, password);
    const profile = await api.getMe();
    setApiUserId(profile.id);
    setCurrentUserState(profile);
    setError('');
  };
  const logout = async () => { await api.logout(); ++sequence.current; setApiUserId(''); setCurrentUserState(null); };
  const switchRole = (role: Role) => { const user = users.find(u => u.role === role); if (user) void setCurrentUser(user); };
  return <AuthContext.Provider value={{ users, currentUser, setCurrentUser, switchRole, isLoading, refreshUsers, demoMode, error, login, logout }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider required'); return value; };
