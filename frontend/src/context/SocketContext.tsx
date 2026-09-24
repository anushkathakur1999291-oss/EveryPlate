import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinDelivery: (deliveryId: string) => void;
  joinDonation: (donationId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) { setSocket(null); setIsConnected(false); return; }
    const s = io('/', {
      auth: { userId },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      setIsConnected(true);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [userId]);

  const joinDelivery = (deliveryId: string) => {
    if (socket && deliveryId) {
      socket.emit('join:delivery', deliveryId);
    }
  };

  const joinDonation = (donationId: string) => {
    if (socket && donationId) {
      socket.emit('join:donation', donationId);
    }
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, joinDelivery, joinDonation }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

/**
 * Reusable hook to subscribe to a Socket.io event with auto cleanup
 */
export function useSocketEvent(eventName: string, handler: (data: any) => void) {
  const { socket } = useSocket();
  const callback = useRef(handler);
  useEffect(() => { callback.current = handler; }, [handler]);
  useEffect(() => {
    if (!socket) return;
    const listener = (data: any) => callback.current(data);
    socket.on(eventName, listener);
    return () => { socket.off(eventName, listener); };
  }, [socket, eventName]);
}
